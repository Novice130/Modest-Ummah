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
  },
  {
    name: 'Women',
    description: 'Abayas, Hijabs, Jilbabs & More',
    href: '/shop/women',
    image: '/images/collections/women.jpg',
  },
  {
    name: 'Accessories',
    description: 'Miswak, Attar, Prayer Items & More',
    href: '/shop/accessories',
    image: '/images/collections/accessories.jpg',
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
    <section className="py-12 md:py-24">
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
          className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 md:gap-6"
        >
          {collections.map((collection) => (
            <motion.div
              key={collection.name}
              variants={itemVariants}
              className="group"
            >
              <Link href={collection.href} className="block">
                <div className="relative aspect-[4/3] sm:aspect-[3/4] rounded-xl overflow-hidden">
                  <Image
                    src={collection.image}
                    alt={collection.name}
                    fill
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                    sizes="(max-width: 768px) 100vw, 33vw"
                  />
                  <div
                    className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent"
                  />
                  <div className="absolute inset-0 flex flex-col justify-end p-4 md:p-6 text-white">
                    <h3 className="font-heading text-xl md:text-3xl mb-1 md:mb-2 drop-shadow-lg">
                      {collection.name}
                    </h3>
                    <p className="text-white text-sm md:text-base mb-3 md:mb-4 drop-shadow-md">{collection.description}</p>
                    <span className="inline-flex items-center text-xs md:text-sm font-semibold group-hover:gap-3 transition-all bg-yellow-600 hover:bg-yellow-700 text-white px-3 md:px-4 py-1.5 md:py-2 rounded-md w-fit shadow-lg">
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
