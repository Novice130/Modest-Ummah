# Functionality Test Plan for Modest Ummah

This document outlines the systematic test plan to verify the core functionality of the Modest Ummah e-commerce platform.

## 1. Public Pages (Guest User)

### 1.1 Homepage (/)
- [ ] **Load**: Page loads successfully with no visible errors.
- [ ] **Header**: Logo, Navigation links (Shop, About, etc.), Search bar, Cart icon, User icon are visible.
- [ ] **Hero Section**: Hero image and "Shop Now" CTA button are present and functional.
- [ ] **Announcement Bar**: Displays free shipping message.
- [ ] **Featured Products**: A grid of products is displayed.
- [ ] **Footer**: Links and payment icons are visible.

### 1.2 Navigation
- [ ] **Shop Link**: Navigates to `/shop`.
- [ ] **About Link**: Navigates to `/about` (or equivalent).
- [ ] **Contact Link**: Navigates to `/contact` (or equivalent).

### 1.3 Shop Page (/shop)
- [ ] **Product Grid**: Products are listed.
- [ ] **Filters**: Category/Price filters are visible (functionality check optional for this pass).
- [ ] **Product Card**: Clicking a product card navigates to `/product/[slug]`.

### 1.4 Product Detail Page (/product/[slug])
- [ ] **Details**: Product title, price, and description are visible.
- [ ] **Gallery**: Images are displayed.
- [ ] **Options**: Size/Color selectors are improved.
- [ ] **Add to Cart**: Clicking "Add to Cart" shows a success message/toast and updates the cart count.

### 1.5 Cart (/cart)
- [ ] **View Cart**: Cart page displays the added item(s).
- [ ] **Quantity**: Can increase/decrease quantity.
- [ ] **Remove**: Can remove an item from the cart.
- [ ] **Checkout Button**: "Proceed to Checkout" button is visible.

### 1.6 Search
- [ ] **Search Bar**: Typing a query displays results (real-time or on enter).


### 1.7 Checkout & Payment (Verified)
- [x] **Stripe Elements**: Payment form loads correctly.
- [x] **Payment Processing**: "Pay Now" successfully processes payment (Simulated/Sandboxed).
- [x] **Confirmation**: System redirects to confirmation page (requires DB fix for full persistence).

## 2. Authentication (User)

### 2.1 Login (/auth/login)
- [ ] **Page Load**: Login form appears.
- [ ] **Google OAuth**: "Continue with Google" button is visible.

### 2.2 Register (/auth/register)
- [ ] **Page Load**: Registration form appears.

## 3. Deployment & System
- [ ] **Console Errors**: No critical errors in the browser console.
- [ ] **Responsive Design**: Basic check that layout works on mobile/desktop dimensions.
