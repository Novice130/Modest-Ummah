import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Heart, Shield, Users, Leaf } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'About Us',
  description: 'Learn about Modest Ummah - our story, mission, and values.',
};

const values = [
  {
    icon: Heart,
    title: 'Faith-Centered',
    description: 'Every piece we create honors the principles of modesty and beauty in Islam.',
  },
  {
    icon: Shield,
    title: 'Quality First',
    description: 'We source premium materials and employ skilled craftspeople to ensure lasting quality.',
  },
  {
    icon: Users,
    title: 'Community Driven',
    description: 'Built by Muslims, for Muslims, with input from our vibrant community.',
  },
  {
    icon: Leaf,
    title: 'Sustainable',
    description: 'Committed to ethical production and environmentally conscious practices.',
  },
];

const team = [
  {
    name: 'Ahmed Rahman',
    role: 'Founder & CEO',
    image: '/images/team/ahmed.jpg',
  },
  {
    name: 'Fatima Hassan',
    role: 'Creative Director',
    image: '/images/team/fatima.jpg',
  },
  {
    name: 'Omar Khalid',
    role: 'Head of Operations',
    image: '/images/team/omar.jpg',
  },
];

export default function AboutPage() {
  return (
    <div>
      {/* Hero */}
      <section className="bg-navy-900 text-white py-20">
        <div className="container-custom">
          <div className="max-w-3xl">
            <h1 className="font-heading text-4xl md:text-5xl mb-6">
              Modest Fashion for the Modern Muslim
            </h1>
            <p className="text-xl text-white/80">
              Modest Ummah was born from a simple belief: that modesty and style can coexist 
              beautifully. We create clothing and accessories that help you express your 
              faith with confidence.
            </p>
          </div>
        </div>
      </section>

      {/* Story */}
      <section className="py-16 md:py-24">
        <div className="container-custom">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="font-heading text-3xl md:text-4xl mb-6">Our Story</h2>
              <div className="space-y-4 text-muted-foreground">
                <p>
                  Modest Ummah was founded in 2020 with a 
                  mission to make quality modest clothing accessible to Muslims worldwide.
                </p>
                <p>
                  What started as a small online store has grown into a beloved brand serving 
                  customers across the globe. From traditional thobes and elegant abayas to 
                  essential sunnah items like miswak and attar, we curate products that honor 
                  our heritage while embracing modern aesthetics.
                </p>
                <p>
                  Every item in our collection is thoughtfully selected or designed to meet 
                  the needs of today&apos;s Muslim, whether for daily wear, prayer, or special 
                  occasions.
                </p>
              </div>
            </div>
            <div className="relative aspect-square bg-muted rounded-2xl overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-sage-300 to-navy-900 opacity-20" />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="font-heading text-6xl text-sage-300/20">Modest Ummah</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="py-16 md:py-24 bg-muted/30">
        <div className="container-custom">
          <div className="text-center mb-12">
            <h2 className="font-heading text-3xl md:text-4xl mb-4">Our Values</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              These principles guide everything we do, from design to delivery.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {values.map((value) => (
              <div key={value.title} className="text-center">
                <div className="w-16 h-16 bg-sage-100 dark:bg-sage-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                  <value.icon className="h-8 w-8 text-sage-600" />
                </div>
                <h3 className="font-heading text-xl mb-2">{value.title}</h3>
                <p className="text-sm text-muted-foreground">{value.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Team */}
      <section className="py-16 md:py-24">
        <div className="container-custom">
          <div className="text-center mb-12">
            <h2 className="font-heading text-3xl md:text-4xl mb-4">Meet Our Team</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              The passionate people behind Modest Ummah.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {team.map((member) => (
              <div key={member.name} className="text-center">
                <div className="w-32 h-32 bg-sage-100 rounded-full mx-auto mb-4" />
                <h3 className="font-heading text-lg">{member.name}</h3>
                <p className="text-sm text-muted-foreground">{member.role}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 md:py-24 bg-sage-100 dark:bg-sage-950/30">
        <div className="container-custom text-center">
          <h2 className="font-heading text-3xl md:text-4xl mb-4">
            Join the Modest Ummah Family
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto mb-8">
            Discover our collection and find pieces that speak to your style and values.
          </p>
          <Button size="lg" asChild>
            <Link href="/shop">
              Shop Now <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
