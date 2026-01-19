import type { Metadata } from 'next';
import AdminLoginForm from '@/components/admin/admin-login-form';

export const metadata: Metadata = {
  title: 'Admin Login',
  description: 'Admin login for Modest Ummah.',
  robots: 'noindex, nofollow',
};

export default function AdminLoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-navy-900 py-12 px-4">
      <AdminLoginForm />
    </div>
  );
}
