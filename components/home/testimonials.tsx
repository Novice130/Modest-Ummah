'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, Star, Quote } from 'lucide-react';
import { Button } from '@/components/ui/button';

const testimonials = [
  {
    id: 1,
    name: 'Fatima Hassan',
    location: 'New York, USA',
    avatar: '/images/testimonials/avatar-1.jpg',
    rating: 5,
    text: "The quality of the abayas from Modest Ummah is exceptional. I've received so many compliments, and the fabric is so comfortable for all-day wear. Will definitely be ordering more!",
    product: 'Elegant Black Abaya',
  },
  {
    id: 2,
    name: 'Ahmed Khan',
    location: 'London, UK',
    avatar: '/images/testimonials/avatar-2.jpg',
    rating: 5,
    text: "Best thobe I've ever owned. The attention to detail and the fit is perfect. The customer service was also incredibly helpful when I needed to exchange sizes.",
    product: 'Premium White Thobe',
  },
  {
    id: 3,
    name: 'Aisha Rahman',
    location: 'Toronto, Canada',
    avatar: '/images/testimonials/avatar-3.jpg',
    rating: 5,
    text: "The hijab collection is amazing! So many beautiful colors to choose from, and the fabric doesn't slip at all. Perfect for busy moms like me who need something practical yet stylish.",
    product: 'Premium Hijab Set',
  },
  {
    id: 4,
    name: 'Omar Farooq',
    location: 'Dubai, UAE',
    avatar: '/images/testimonials/avatar-4.jpg',
    rating: 5,
    text: 'The miswak and attar collection reminds me of home. Authentic quality products that are hard to find elsewhere. Fast shipping to UAE as well!',
    product: 'Arabian Oud Attar',
  },
];

export default function Testimonials() {
  const [currentIndex, setCurrentIndex] = useState(0);

  const next = () => {
    setCurrentIndex((prev) => (prev + 1) % testimonials.length);
  };

  const prev = () => {
    setCurrentIndex((prev) => (prev - 1 + testimonials.length) % testimonials.length);
  };

  return (
    <section className="py-16 md:py-24 bg-navy-900 text-white overflow-hidden">
      <div className="container-custom">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <h2 className="font-heading text-3xl md:text-4xl mb-4">
            What Our Community Says
          </h2>
          <p className="text-white/70 max-w-2xl mx-auto">
            Join thousands of satisfied customers who have found their perfect modest wear
            with Modest Ummah.
          </p>
        </motion.div>

        <div className="relative max-w-4xl mx-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentIndex}
              initial={{ opacity: 0, x: 100 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -100 }}
              transition={{ duration: 0.4 }}
              className="bg-white/5 backdrop-blur rounded-2xl p-8 md:p-12"
            >
              <Quote className="w-12 h-12 text-sage-300 mb-6 opacity-50" />
              
              <div className="flex gap-1 mb-4">
                {Array.from({ length: testimonials[currentIndex].rating }).map((_, i) => (
                  <Star key={i} className="w-5 h-5 fill-gold-200 text-gold-200" />
                ))}
              </div>

              <p className="text-lg md:text-xl text-white/90 mb-8 leading-relaxed">
                &ldquo;{testimonials[currentIndex].text}&rdquo;
              </p>

              <div className="flex items-center gap-4">
                <div className="relative w-14 h-14 rounded-full overflow-hidden bg-white/20">
                  <Image
                    src={testimonials[currentIndex].avatar}
                    alt={testimonials[currentIndex].name}
                    fill
                    className="object-cover"
                  />
                </div>
                <div>
                  <p className="font-heading font-semibold">
                    {testimonials[currentIndex].name}
                  </p>
                  <p className="text-sm text-white/60">
                    {testimonials[currentIndex].location}
                  </p>
                  <p className="text-sm text-sage-300">
                    Purchased: {testimonials[currentIndex].product}
                  </p>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Navigation */}
          <div className="flex justify-center gap-4 mt-8">
            <Button
              variant="outline"
              size="icon"
              onClick={prev}
              className="rounded-full border-white/30 text-white hover:bg-white/10"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            
            <div className="flex items-center gap-2">
              {testimonials.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentIndex(index)}
                  className={`w-2 h-2 rounded-full transition-all ${
                    index === currentIndex ? 'bg-sage-300 w-6' : 'bg-white/30'
                  }`}
                />
              ))}
            </div>

            <Button
              variant="outline"
              size="icon"
              onClick={next}
              className="rounded-full border-white/30 text-white hover:bg-white/10"
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
