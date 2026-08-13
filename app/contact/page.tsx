import type { Metadata } from 'next';
import Link from 'next/link';
import { Mail, MapPin, Clock, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ContactForm } from '@/components/contact/contact-form';

export const metadata: Metadata = {
  title: 'Contact Us',
  description: 'Get in touch with Modest Ummah. We\'re here to help with any questions.',
};

const contactInfo = [
  {
    icon: Mail,
    title: 'Email',
    details: 'support@modestummah.com',
    description: 'We\'ll respond within 24 hours',
  },
  {
    icon: MapPin,
    title: 'Location',
    details: 'New York, NY',
    description: 'Online store — we ship worldwide',
  },
  {
    icon: Clock,
    title: 'Hours',
    details: 'Mon-Fri: 9am-6pm EST',
    description: 'Sat: 10am-4pm EST',
  },
];

export default function ContactPage() {
  return (
    <div>
      {/* Hero */}
      <section className="bg-navy-900 text-white py-16">
        <div className="container-custom text-center">
          <h1 className="font-heading text-4xl md:text-5xl mb-4">Get in Touch</h1>
          <p className="text-xl text-white/80 max-w-2xl mx-auto">
            Have a question or feedback? We&apos;d love to hear from you. Our team is here to help.
          </p>
        </div>
      </section>

      <section className="py-16 md:py-24">
        <div className="container-custom">
          <div className="grid lg:grid-cols-2 gap-12">
            {/* Contact Form */}
            <div>
              <h2 className="font-heading text-2xl mb-6">Send us a Message</h2>
              <ContactForm />
            </div>

            {/* Contact Info */}
            <div>
              <h2 className="font-heading text-2xl mb-6">Contact Information</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                {contactInfo.map((info) => (
                  <div key={info.title} className="border rounded-lg p-6 bg-card">
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 bg-sage-100 dark:bg-sage-900/30 rounded-lg flex items-center justify-center shrink-0">
                        <info.icon className="h-5 w-5 text-sage-600" />
                      </div>
                      <div>
                        <h3 className="font-medium">{info.title}</h3>
                        <p className="text-sm font-medium text-sage-600">{info.details}</p>
                        <p className="text-xs text-muted-foreground">{info.description}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-8 p-6 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">
                  <Send className="h-4 w-4 inline mr-2 text-sage-600" />
                  Messages go straight to our support inbox. Please include your order number
                  if you have one.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ CTA */}
      <section className="py-12 bg-muted/30">
        <div className="container-custom text-center">
          <h2 className="font-heading text-2xl mb-4">Have Common Questions?</h2>
          <p className="text-muted-foreground mb-6">
            Check out our FAQ page for quick answers to frequently asked questions.
          </p>
          <Button variant="outline" asChild>
            <Link href="/faq">View FAQ</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
