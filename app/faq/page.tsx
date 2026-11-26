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
        answer: 'Delivery estimates for each shipping service are shown at checkout once you enter your address. They are estimates, not guarantees.',
      },
      {
        question: 'Do you ship internationally?',
        answer: 'The countries we currently ship to are listed in the country menu at checkout. Shipping costs and delivery estimates vary by location and are shown at checkout.',
      },
      {
        question: 'How can I track my order?',
        answer: 'Once your order ships, you\'ll receive an email with a tracking number. You can also see your order status by logging into your account and viewing your order history.',
      },
      {
        question: 'Is there free shipping?',
        answer: 'Yes. Orders of $75 or more after discounts ship free within the US.',
      },
    ],
  },
  {
    title: 'Returns & Exchanges',
    questions: [
      {
        question: 'What is your return policy?',
        answer: 'We offer a 30-day return policy for unworn, unwashed items in original condition with tags attached. Opened personal-care items (miswak, attar) and worn garments cannot be returned. See our returns page for details.',
      },
      {
        question: 'How do I initiate a return?',
        answer: 'Returns are handled by email. Send your order number and the item(s) you would like to return to support@modestummah.com, and we will reply with a return address.',
      },
      {
        question: 'How long do refunds take?',
        answer: 'Refunds are issued to your original payment method within 5-10 business days of receiving your return. The time for the refund to appear in your account depends on your payment method and bank.',
      },
      {
        question: 'Can I exchange for a different size?',
        answer: 'We do not have a separate exchange process. To change a size, return the item within 30 days and place a new order for the size you want.',
      },
    ],
  },
  {
    title: 'Products',
    questions: [
      {
        question: 'How do I find my size?',
        answer: 'Available sizes are listed on each product page. If you are not sure which size to choose, email support@modestummah.com before ordering.',
      },
      {
        question: 'What materials do you use?',
        answer: 'Materials vary by product. Check the product description, or email support@modestummah.com if the material is not listed.',
      },
      {
        question: 'How do I care for my garments?',
        answer: 'Check the garment tag or the product description for care instructions, or email support@modestummah.com if you need more guidance.',
      },
    ],
  },
  {
    title: 'Payment & Security',
    questions: [
      {
        question: 'What payment methods do you accept?',
        answer: 'We accept major credit and debit cards, including Visa, Mastercard, and American Express. Other payment options may appear at checkout depending on your device and location. All payments are processed through Stripe.',
      },
      {
        question: 'Is my payment information secure?',
        answer: 'Absolutely. We use industry-standard SSL encryption and never store your full payment details. All transactions are processed through Stripe, a PCI-compliant payment processor.',
      },
      {
        question: 'Do you offer payment plans?',
        answer: 'Currently, we don\'t offer payment plans directly. Some credit cards offer their own installment options.',
      },
    ],
  },
  {
    title: 'Account & Support',
    questions: [
      {
        question: 'How do I create an account?',
        answer: 'Open the sign-in page from the top navigation and choose "Sign up." You can register with your email address, or with Google or Apple where those options are shown.',
      },
      {
        question: 'I forgot my password. What do I do?',
        answer: 'Email us at support@modestummah.com and we\'ll help you reset your password.',
      },
      {
        question: 'How can I contact customer support?',
        answer: 'You can reach us at support@modestummah.com or through our contact page.',
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
