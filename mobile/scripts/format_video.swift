import Foundation
import AVFoundation

func generateSilence() {
    let sampleRate: Double = 44100.0
    let channels: AVAudioChannelCount = 2
    let durationSeconds: Double = 35.0
    let frameCount = AVAudioFrameCount(sampleRate * durationSeconds)

    guard let format = AVAudioFormat(standardFormatWithSampleRate: sampleRate, channels: channels) else { return }
    guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount) else { return }
    buffer.frameLength = frameCount

    let cafUrl = URL(fileURLWithPath: "/tmp/silence.caf")
    let m4aUrl = URL(fileURLWithPath: "/tmp/silence.m4a")
    try? FileManager.default.removeItem(at: cafUrl)
    try? FileManager.default.removeItem(at: m4aUrl)

    if let audioFile = try? AVAudioFile(forWriting: cafUrl, settings: format.settings) {
        try? audioFile.write(from: buffer)
    }

    let proc = Process()
    proc.executableURL = URL(fileURLWithPath: "/usr/bin/afconvert")
    proc.arguments = ["-f", "m4af", "-d", "aac", "-c", "2", "-b", "256000", "/tmp/silence.caf", "/tmp/silence.m4a"]
    try? proc.run()
    proc.waitUntilExit()
}

func processVideo(
    inputPath: String,
    outputPath: String,
    startTime: Double,
    duration: Double,
    targetWidth: Int,
    targetHeight: Int
) {
    let semaphore = DispatchSemaphore(value: 0)
    let asset = AVURLAsset(url: URL(fileURLWithPath: inputPath))
    
    let composition = AVMutableComposition()
    guard let compVideoTrack = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid) else {
        print("Failed to create video track")
        return
    }
    
    guard let assetVideoTrack = asset.tracks(withMediaType: .video).first else {
        print("No video track found in \(inputPath)")
        return
    }
    
    let timeRange = CMTimeRange(
        start: CMTime(seconds: startTime, preferredTimescale: 600),
        duration: CMTime(seconds: duration, preferredTimescale: 600)
    )
    
    do {
        try compVideoTrack.insertTimeRange(timeRange, of: assetVideoTrack, at: .zero)
    } catch {
        print("Failed to insert time range: \(error)")
        return
    }

    // Add stereo audio track to satisfy Apple's MOV_RESAVE_STEREO requirement
    let silenceUrl = URL(fileURLWithPath: "/tmp/silence.m4a")
    if !FileManager.default.fileExists(atPath: silenceUrl.path) {
        generateSilence()
    }
    let audioAsset = AVURLAsset(url: silenceUrl)
    if let assetAudioTrack = audioAsset.tracks(withMediaType: .audio).first,
       let compAudioTrack = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid) {
        let audioRange = CMTimeRange(start: .zero, duration: CMTime(seconds: duration, preferredTimescale: 600))
        try? compAudioTrack.insertTimeRange(audioRange, of: assetAudioTrack, at: .zero)
        print("  ✓ Added Stereo AAC audio track")
    }
    
    let videoComposition = AVMutableVideoComposition()
    videoComposition.renderSize = CGSize(width: targetWidth, height: targetHeight)
    videoComposition.frameDuration = CMTime(value: 1, timescale: 30)
    
    let instruction = AVMutableVideoCompositionInstruction()
    instruction.timeRange = CMTimeRange(start: .zero, duration: CMTime(seconds: duration, preferredTimescale: 600))
    
    let layerInstruction = AVMutableVideoCompositionLayerInstruction(assetTrack: compVideoTrack)
    
    let naturalSize = assetVideoTrack.naturalSize
    let scaleX = CGFloat(targetWidth) / naturalSize.width
    let scaleY = CGFloat(targetHeight) / naturalSize.height
    let scale = max(scaleX, scaleY)
    
    let scaledW = naturalSize.width * scale
    let scaledH = naturalSize.height * scale
    let tx = (CGFloat(targetWidth) - scaledW) / 2.0
    let ty = (CGFloat(targetHeight) - scaledH) / 2.0
    
    var transform = CGAffineTransform(scaleX: scale, y: scale)
    transform = transform.concatenating(CGAffineTransform(translationX: tx, y: ty))
    layerInstruction.setTransform(transform, at: .zero)
    
    instruction.layerInstructions = [layerInstruction]
    videoComposition.instructions = [instruction]
    
    if FileManager.default.fileExists(atPath: outputPath) {
        try? FileManager.default.removeItem(atPath: outputPath)
    }
    
    guard let exportSession = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetHighestQuality) else {
        print("Failed to create export session")
        return
    }
    
    exportSession.videoComposition = videoComposition
    exportSession.outputURL = URL(fileURLWithPath: outputPath)
    exportSession.outputFileType = .mp4
    exportSession.shouldOptimizeForNetworkUse = true
    
    exportSession.exportAsynchronously {
        if exportSession.status == .completed {
            print("Successfully formatted and exported App Preview to: \(outputPath)")
        } else {
            print("Export failed: \(String(describing: exportSession.error))")
        }
        semaphore.signal()
    }
    
    semaphore.wait()
}

generateSilence()

let args = CommandLine.arguments
if args.count < 7 {
    print("Usage: format_video.swift <input> <output> <startTime> <duration> <width> <height>")
    exit(1)
}

let input = args[1]
let output = args[2]
let start = Double(args[3]) ?? 0.0
let dur = Double(args[4]) ?? 28.0
let w = Int(args[5]) ?? 886
let h = Int(args[6]) ?? 1920

processVideo(inputPath: input, outputPath: output, startTime: start, duration: dur, targetWidth: w, targetHeight: h)
