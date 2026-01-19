'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight } from 'lucide-react';

const collections = [
  {
    name: 'Men',
    description: 'Thobes, Kurtas, Kufis & More',
    href: '/shop/men',
    image: '/images/collections/men.jpg',
    color: 'from-navy-900/70',
  },
  {
    name: 'Women',
    description: 'Abayas, Hijabs, Jilbabs & More',
    href: '/shop/women',
    image: '/images/collections/women.jpg',
    color: 'from-rose-300/70',
  },
  {
    name: 'Accessories',
    description: 'Miswak, Attar, Prayer Items & More',
    href: '/shop/accessories',
    image: '/images/collections/accessories.jpg',
    color: 'from-mocha-700/70',
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.2,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0 },
};

export default function FeaturedCollections() {
  return (
    <section className="py-16 md:py-24">
      <div className="container-custom">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <h2 className="font-heading text-3xl md:text-4xl mb-4">Shop by Category</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Explore our curated collections designed for every occasion. From daily wear to
            special moments, find pieces that reflect your values and style.
          </p>
        </motion.div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="grid md:grid-cols-3 gap-6"
        >
          {collections.map((collection) => (
            <motion.div
              key={collection.name}
              variants={itemVariants}
              className="group"
            >
              <Link href={collection.href} className="block">
                <div className="relative aspect-[3/4] rounded-xl overflow-hidden">
                  <Image
                    src={collection.image}
                    alt={collection.name}
                    fill
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                    sizes="(max-width: 768px) 100vw, 33vw"
                  />
                  <div
                    className={`absolute inset-0 bg-gradient-to-t ${collection.color} to-transparent`}
                  />
                  <div className="absolute inset-0 flex flex-col justify-end p-6 text-white">
                    <h3 className="font-heading text-2xl md:text-3xl mb-2">
                      {collection.name}
                    </h3>
                    <p className="text-white/80 mb-4">{collection.description}</p>
                    <span className="inline-flex items-center text-sm font-medium group-hover:gap-3 transition-all">
                      Shop Now <ArrowRight className="ml-2 h-4 w-4" />
                    </span>
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
