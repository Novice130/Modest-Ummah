'use client';

import { motion } from 'framer-motion';
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
            <p className="text-lg md:text-xl text-white/90 leading-relaxed text-center">
              Free US shipping on orders of $75 or more after discounts, a 30-day return
              policy on unworn items, and support by email.
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
