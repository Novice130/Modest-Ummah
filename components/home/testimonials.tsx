'use client';

import { motion } from 'framer-motion';
import { Star, Quote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function Testimonials() {
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
            Our Promise
          </h2>
          <p className="text-white/70 max-w-2xl mx-auto">
            Quality modest wear, honest pricing, and real support. That is the standard for
            every order we ship.
          </p>
        </motion.div>

        <div className="relative max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, x: 100 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4 }}
            className="bg-white/5 backdrop-blur rounded-2xl p-8 md:p-12"
          >
            <Quote className="w-12 h-12 text-sage-300 mb-6 opacity-50" />

            <div className="flex gap-1 mb-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className="w-5 h-5 fill-gold-200 text-gold-200" />
              ))}
            </div>

            <p className="text-lg md:text-xl text-white/90 mb-8 leading-relaxed">
              &ldquo;Free shipping over $75, a 30-day return policy, and support that
              answers within 24 hours — on every order, no exceptions.&rdquo;
            </p>

            <p className="text-sm text-white/60">
              The Modest Ummah guarantee
            </p>
          </motion.div>
        </div>

        <div className="text-center mt-10">
          <Button variant="outline" asChild className="rounded-full border-white/30 text-white hover:bg-white/10">
            <Link href="/shop">Shop the Collection</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
