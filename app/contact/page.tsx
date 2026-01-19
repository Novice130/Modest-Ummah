import type { Metadata } from 'next';
import { Mail, Phone, MapPin, Clock, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';

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
    icon: Phone,
    title: 'Phone',
    details: '+1 (234) 567-890',
    description: 'Mon-Fri, 9am-6pm EST',
  },
  {
    icon: MapPin,
    title: 'Address',
    details: '123 Fashion Ave, New York, NY 10001',
    description: 'Visit our showroom',
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
              <form className="space-y-6">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input id="firstName" placeholder="John" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input id="lastName" placeholder="Doe" required />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" placeholder="john@example.com" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="subject">Subject</Label>
                  <Input id="subject" placeholder="How can we help?" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="message">Message</Label>
                  <textarea
                    id="message"
                    className="w-full min-h-[150px] px-3 py-2 border rounded-md resize-y focus:outline-none focus:ring-2 focus:ring-sage-300"
                    placeholder="Tell us more about your inquiry..."
                    required
                  />
                </div>
                <Button type="submit" size="lg" className="w-full md:w-auto">
                  <Send className="h-4 w-4 mr-2" />
                  Send Message
                </Button>
              </form>
            </div>

            {/* Contact Info */}
            <div>
              <h2 className="font-heading text-2xl mb-6">Contact Information</h2>
              <div className="grid sm:grid-cols-2 gap-4 mb-8">
                {contactInfo.map((info) => (
                  <Card key={info.title}>
                    <CardContent className="pt-6">
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
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Map Placeholder */}
              <div className="aspect-video bg-muted rounded-lg flex items-center justify-center">
                <p className="text-muted-foreground">Map would be displayed here</p>
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
            <a href="/faq">View FAQ</a>
          </Button>
        </div>
      </section>
    </div>
  );
}
