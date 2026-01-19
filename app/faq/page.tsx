import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Frequently Asked Questions',
  description: 'Find answers to common questions about Modest Ummah products, shipping, returns, and more.',
};

const faqCategories = [
  {
    title: 'Orders & Shipping',
    questions: [
      {
        question: 'How long does shipping take?',
        answer: 'Standard shipping takes 5-10 business days within the US. Express shipping is available for 2-4 business days. International shipping varies by destination, typically 7-21 business days.',
      },
      {
        question: 'Do you ship internationally?',
        answer: 'Yes! We ship to over 50 countries including USA, Canada, UK, UAE, Saudi Arabia, Pakistan, Malaysia, and many more. Shipping costs and delivery times vary by location.',
      },
      {
        question: 'How can I track my order?',
        answer: 'Once your order ships, you\'ll receive an email with a tracking number. You can also track your order by logging into your account and viewing your order history.',
      },
      {
        question: 'Is there free shipping?',
        answer: 'Yes! We offer free standard shipping on all orders over $75 within the US. International orders may have different thresholds.',
      },
    ],
  },
  {
    title: 'Returns & Exchanges',
    questions: [
      {
        question: 'What is your return policy?',
        answer: 'We offer a 30-day return policy for unworn items in original condition with tags attached. Items must be returned in their original packaging. Some items like intimate wear and personalized products cannot be returned.',
      },
      {
        question: 'How do I initiate a return?',
        answer: 'Log into your account, go to Order History, select the order, and click "Request Return." Follow the prompts to generate a return label. You can also contact our support team for assistance.',
      },
      {
        question: 'How long do refunds take?',
        answer: 'Once we receive your return, refunds are processed within 5-7 business days. The time for the refund to appear in your account depends on your payment method and bank.',
      },
      {
        question: 'Can I exchange for a different size?',
        answer: 'Yes! You can exchange items for a different size within 30 days. Simply initiate a return and place a new order for the correct size. We\'ll expedite the exchange process.',
      },
    ],
  },
  {
    title: 'Products',
    questions: [
      {
        question: 'How do I find my size?',
        answer: 'Each product page includes a detailed size guide. We recommend measuring yourself and comparing to our charts. If you\'re between sizes, we generally recommend sizing up for a comfortable modest fit.',
      },
      {
        question: 'What materials do you use?',
        answer: 'We use premium materials including cotton, cotton blends, jersey, chiffon, and sustainable fabrics. Each product description lists the specific materials used.',
      },
      {
        question: 'Are your products ethically made?',
        answer: 'Yes, we partner with manufacturers who follow ethical labor practices. We regularly audit our supply chain and prioritize sustainable and fair-trade production.',
      },
      {
        question: 'How do I care for my garments?',
        answer: 'Care instructions are included on each product tag and in the product description. Generally, we recommend cold water washing and air drying for most items to maintain quality.',
      },
    ],
  },
  {
    title: 'Payment & Security',
    questions: [
      {
        question: 'What payment methods do you accept?',
        answer: 'We accept all major credit cards (Visa, Mastercard, American Express), PayPal, Apple Pay, and Google Pay. All payments are processed securely through Stripe.',
      },
      {
        question: 'Is my payment information secure?',
        answer: 'Absolutely. We use industry-standard SSL encryption and never store your full payment details. All transactions are processed through Stripe, a PCI-compliant payment processor.',
      },
      {
        question: 'Do you offer payment plans?',
        answer: 'Currently, we don\'t offer payment plans directly. However, some payment methods like PayPal and certain credit cards offer their own installment options.',
      },
    ],
  },
  {
    title: 'Account & Support',
    questions: [
      {
        question: 'How do I create an account?',
        answer: 'Click "Sign In" in the top navigation and then "Create Account." You can register with your email or sign up with Google for faster checkout.',
      },
      {
        question: 'I forgot my password. What do I do?',
        answer: 'Click "Sign In" then "Forgot Password." Enter your email address and we\'ll send you a link to reset your password.',
      },
      {
        question: 'How can I contact customer support?',
        answer: 'You can reach us at support@modestummah.com or call +1 (234) 567-890 Monday-Friday, 9am-6pm EST. We typically respond to emails within 24 hours.',
      },
    ],
  },
];

export default function FAQPage() {
  return (
    <div>
      {/* Hero */}
      <section className="bg-navy-900 text-white py-16">
        <div className="container-custom text-center">
          <h1 className="font-heading text-4xl md:text-5xl mb-4">
            Frequently Asked Questions
          </h1>
          <p className="text-xl text-white/80 max-w-2xl mx-auto">
            Find answers to common questions about our products, shipping, returns, and more.
          </p>
        </div>
      </section>

      {/* FAQ Content */}
      <section className="py-16 md:py-24">
        <div className="container-custom max-w-4xl">
          {faqCategories.map((category) => (
            <div key={category.title} className="mb-12">
              <h2 className="font-heading text-2xl mb-6">{category.title}</h2>
              <Accordion type="single" collapsible className="space-y-2">
                {category.questions.map((faq, index) => (
                  <AccordionItem key={index} value={`${category.title}-${index}`} className="border rounded-lg px-4">
                    <AccordionTrigger className="text-left">
                      {faq.question}
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground">
                      {faq.answer}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          ))}
        </div>
      </section>

      {/* Still Need Help */}
      <section className="py-12 bg-muted/30">
        <div className="container-custom text-center">
          <h2 className="font-heading text-2xl mb-4">Still Have Questions?</h2>
          <p className="text-muted-foreground mb-6">
            Can&apos;t find what you&apos;re looking for? Our support team is here to help.
          </p>
          <Button asChild>
            <Link href="/contact">Contact Us</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
