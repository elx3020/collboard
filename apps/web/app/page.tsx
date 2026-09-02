import Hero from "@/components/landing/hero";
import HeroGlow from "@/components/landing/hero-glow";
import LandingNav from "@/components/landing/landing-nav";
// import FeaturesSectionMain from "@/components/landing/features-section-main";

export default function Home() {
  return (
    <div className="bg-background">
      <LandingNav />
      <Hero
        title="A better way to collaborate."
        subtitle="Sync your team’s work, processes, and tools into one collaborative workspace."
        cta={{ label: "Get started", href: "/auth/signin" }}
        background={<HeroGlow />}
      />
      {/* <FeaturesSectionMain /> */}
    </div>
  );
}
