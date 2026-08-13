'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Check } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { subscribeNewsletterAction } from '@/lib/actions/newsletter.actions';

export default function Newsletter() {
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [subscribing, setSubscribing] = useState(false);
  const [subscribed, setSubscribed] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (subscribed) return;
    setSubscribing(true);
    try {
      await subscribeNewsletterAction(email);
      setSubscribed(true);
      toast({ title: 'Subscribed!', description: 'You are on the list.' });
    } catch (err: any) {
      toast({
        title: 'Subscription failed',
        description: err?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSubscribing(false);
    }
  };

  return (
    <section className="py-16 md:py-24 bg-sage-100 dark:bg-sage-950/30">
      <div className="container-custom">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-2xl mx-auto text-center"
        >
          <h2 className="font-heading text-3xl md:text-4xl mb-4">
            Stay Connected
          </h2>
          <p className="text-muted-foreground mb-8">
            Subscribe to our newsletter for exclusive offers, new arrivals, and styling tips.
            Be the first to know about our latest collections.
          </p>
          
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
            <Input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1"
              required
            />
            <Button type="submit" size="lg" disabled={subscribing || subscribed}>
              {subscribing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : subscribed ? (
                <Check className="h-4 w-4" />
              ) : null}
              {subscribed ? 'Subscribed' : 'Subscribe'}
            </Button>
          </form>
          
          <p className="text-xs text-muted-foreground mt-4">
            By subscribing, you agree to our Privacy Policy and consent to receive updates.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
