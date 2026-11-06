import { Hero } from "@/components/landing/hero";
import { HowItWorks, PrivacySection, ReviewModesOverview } from "@/components/landing/product-sections";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main id="main-content" tabIndex={-1}>
        <Hero />
        <ReviewModesOverview />
        <HowItWorks />
        <PrivacySection />
      </main>
      <SiteFooter />
    </>
  );
}
