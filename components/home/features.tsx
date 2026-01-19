'use client';

import { motion } from 'framer-motion';
import { Truck, Shield, RefreshCw, Headphones } from 'lucide-react';

const features = [
  {
    icon: Truck,
    title: 'Free Shipping',
    description: 'Free shipping on orders over $75. Fast delivery worldwide.',
  },
  {
    icon: Shield,
    title: 'Secure Payments',
    description: 'Your payment information is processed securely.',
  },
  {
    icon: RefreshCw,
    title: 'Easy Returns',
    description: '30-day return policy. No questions asked.',
  },
  {
    icon: Headphones,
    title: '24/7 Support',
    description: "We're here to help you anytime you need us.",
  },
];

export default function Features() {
  return (
    <section className="py-16 md:py-24">
      <div className="container-custom">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: index * 0.1 }}
              className="text-center group"
            >
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-sage-100 dark:bg-sage-900/30 mb-4 group-hover:bg-sage-200 dark:group-hover:bg-sage-900/50 transition-colors">
                <feature.icon className="w-6 h-6 text-sage-600 dark:text-sage-400" />
              </div>
              <h3 className="font-heading font-semibold mb-2">{feature.title}</h3>
              <p className="text-sm text-muted-foreground">{feature.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
