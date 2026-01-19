'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Hero() {
  return (
    <section className="relative min-h-[60vh] md:min-h-[80vh] flex items-center overflow-hidden py-12 md:py-0">
      {/* Background Image */}
      <div className="absolute inset-0 z-0">
        <Image
          src="/images/hero-bg.jpg"
          alt="Modest Fashion"
          fill
          priority
          className="object-cover"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-navy-900/80 to-navy-900/40" />
      </div>

      {/* Content */}
      <div className="container-custom relative z-10">
        <div className="max-w-2xl">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <span className="inline-block text-gold-200 font-medium mb-4">
              Welcome to Modest Ummah
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="font-heading text-3xl md:text-5xl lg:text-6xl text-white mb-4 md:mb-6 leading-tight"
          >
            Elevate Your Style,{' '}
            <span className="text-sage-300">Honor Your Values</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-white text-base md:text-xl mb-6 md:mb-8 max-w-lg drop-shadow-sm"
          >
            Premium modest fashion for the modern Muslim. Shop abayas, thobes, hijabs & more.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex flex-col sm:flex-row gap-3 md:gap-4"
          >
            <Button size="lg" asChild className="font-semibold shadow-lg w-full sm:w-auto">
              <Link href="/shop">
                Shop Now <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="bg-white/10 border-white/30 text-white hover:bg-white/20 w-full sm:w-auto">
              <Link href="/shop/women">Women&apos;s Collection</Link>
            </Button>
          </motion.div>

          {/* Stats */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="flex gap-6 md:gap-12 mt-8 md:mt-12 pt-6 md:pt-8 border-t border-white/20"
          >
            <div>
              <p className="text-2xl md:text-4xl font-heading font-bold text-white">500+</p>
              <p className="text-white/60 text-sm">Products</p>
            </div>
            <div>
              <p className="text-2xl md:text-4xl font-heading font-bold text-white">10K+</p>
              <p className="text-white/60 text-sm">Happy Customers</p>
            </div>
            <div>
              <p className="text-2xl md:text-4xl font-heading font-bold text-white">4.9</p>
              <p className="text-white/60 text-sm">Average Rating</p>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Decorative Elements */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 0.1, scale: 1 }}
        transition={{ duration: 1, delay: 0.5 }}
        className="absolute right-0 bottom-0 w-96 h-96 bg-sage-300 rounded-full blur-3xl"
      />
    </section>
  );
}
