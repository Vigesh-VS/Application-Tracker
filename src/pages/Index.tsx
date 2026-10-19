import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';
import { PageLayout } from '@/components/PageLayout';
import { useScrollAnimation, useParallax } from '@/hooks/useScrollAnimation';
import { cn } from '@/lib/utils';
import { 
  ClipboardList, 
  BarChart3, 
  Shield, 
  Zap,
  ArrowRight,
  CheckCircle,
  Github
} from 'lucide-react';

const REPOSITORY_URL = 'https://github.com/Vigesh-VS/Application-Tracker';

const features = [
  {
    icon: <ClipboardList className="h-6 w-6" />,
    title: 'Track Applications',
    description: 'Log every job application with company, position, salary, and status tracking.',
  },
  {
    icon: <BarChart3 className="h-6 w-6" />,
    title: 'Analytics Dashboard',
    description: 'Visualize your job search progress with insightful charts and metrics.',
  },
  {
    icon: <Shield className="h-6 w-6" />,
    title: 'Secure & Private',
    description: 'Your data is encrypted and only accessible by you.',
  },
];

const benefits = [
  'Never lose track of an application again',
  'See which companies respond fastest',
  'Track your acceptance and rejection rates',
  'Compare salary ranges across positions',
  'Set follow-up reminders for pending applications',
];

function AnimatedSection({ 
  children, 
  className,
  delay = 0
}: { 
  children: React.ReactNode; 
  className?: string;
  delay?: number;
}) {
  const { ref, isVisible } = useScrollAnimation<HTMLDivElement>({ threshold: 0.15 });
  
  return (
    <div 
      ref={ref}
      className={cn(
        'transition-all duration-700 ease-out',
        isVisible 
          ? 'opacity-100 translate-y-0' 
          : 'opacity-0 translate-y-10',
        className
      )}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

function FeatureCard({ feature, index }: { feature: typeof features[0]; index: number }) {
  const { ref, isVisible } = useScrollAnimation<HTMLDivElement>({ threshold: 0.2 });
  
  return (
    <div 
      ref={ref}
      className={cn(
        'group p-6 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 transition-all duration-500',
        'hover:border-white/30 hover:bg-white/10 hover:-translate-y-2',
        isVisible 
          ? 'opacity-100 translate-y-0' 
          : 'opacity-0 translate-y-10'
      )}
      style={{ transitionDelay: `${index * 100}ms` }}
      data-hover
    >
      <div className="p-3 rounded-lg bg-white/10 text-white w-fit mb-4 transition-all duration-300 group-hover:scale-110 group-hover:bg-white/20">
        {feature.icon}
      </div>
      <h3 className="font-display font-semibold text-lg mb-2 text-white">
        {feature.title}
      </h3>
      <p className="text-white/80 text-sm">
        {feature.description}
      </p>
    </div>
  );
}

export default function Index() {
  const { user } = useAuth();
  const parallaxOffset = useParallax(0.3);

  return (
    <PageLayout showNavbar showBackToTop>
      {/* Hero Section */}
      <section className="relative overflow-hidden pt-32">
        <div 
          className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.05),transparent_50%)]"
          style={{ transform: `translateY(${parallaxOffset * 0.5}px)` }}
        />
        <div 
          className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(255,255,255,0.03),transparent_50%)]"
          style={{ transform: `translateY(${parallaxOffset * 0.3}px)` }}
        />
        
        {/* Floating shapes with parallax */}
        <div 
          className="absolute top-32 left-10 w-24 h-24 rounded-full bg-white/5 blur-2xl"
          style={{ transform: `translateY(${parallaxOffset * 0.8}px)` }}
        />
        <div 
          className="absolute top-48 right-20 w-32 h-32 rounded-full bg-white/5 blur-3xl"
          style={{ transform: `translateY(${parallaxOffset * 0.6}px)` }}
        />
        <div 
          className="absolute bottom-20 left-1/4 w-16 h-16 rounded-full bg-white/5 blur-xl"
          style={{ transform: `translateY(${parallaxOffset * 1.2}px)` }}
        />
        
        <div className="container mx-auto px-4 py-20 md:py-32 relative">
          <div className="max-w-3xl mx-auto text-center">
            <AnimatedSection delay={0}>
              <div 
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 text-white text-sm font-medium mb-6 hover:bg-white/20 transition-colors cursor-pointer border border-white/20"
                data-hover
              >
                <Zap className="h-4 w-4" />
                Organize your job search
              </div>
            </AnimatedSection>
            
            <AnimatedSection delay={100}>
              <h1 className="font-display text-4xl md:text-6xl font-bold tracking-tight mb-6 text-white">
                Track Your Job Applications
                <span className="block text-white/80 mt-2">Like a Pro</span>
              </h1>
            </AnimatedSection>
            
            <AnimatedSection delay={200}>
              <p className="text-lg md:text-xl text-white/80 mb-8 max-w-2xl mx-auto">
                Stay organized during your job search. Track applications, monitor responses, 
                and get insights into your progress with our intuitive tracking system.
              </p>
            </AnimatedSection>
            
            <AnimatedSection delay={300}>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                {user ? (
                  <Button asChild size="lg" className="bg-white text-black hover:bg-white/90 hover:scale-105 hover:shadow-lg hover:shadow-white/20 rounded-full gap-2 font-medium transition-all duration-300" data-hover>
                    <Link to="/dashboard">
                      Go to Dashboard
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                ) : (
                  <Button asChild variant="retro" size="retro" className="gap-2" data-hover>
                    <Link to="/signup">
                      Get Started Free
                      <ArrowRight className="h-5 w-5" />
                    </Link>
                  </Button>
                )}
              </div>
            </AnimatedSection>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 scroll-mt-20">
        <div className="container mx-auto px-4">
          <AnimatedSection className="text-center mb-12">
            <h2 className="font-display text-3xl md:text-4xl font-bold mb-4 text-white">
              Everything You Need
            </h2>
            <p className="text-white/80 max-w-2xl mx-auto">
              Powerful features to help you manage your job search efficiently
            </p>
          </AnimatedSection>

          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {features.map((feature, index) => (
              <FeatureCard key={feature.title} feature={feature} index={index} />
            ))}
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section id="benefits" className="py-20 scroll-mt-20">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            {/* Centered heading */}
            <AnimatedSection className="text-center mb-8">
              <h2 className="font-display text-3xl md:text-4xl font-bold mb-4 text-white">
                Take Control of Your Job Search
              </h2>
              <p className="text-white/80 max-w-2xl mx-auto">
                Stop using spreadsheets and sticky notes. Our job tracker gives you 
                a clear overview of every application, interview, and offer.
              </p>
            </AnimatedSection>

            {/* Benefits Grid */}
            <AnimatedSection>
            <ul className="grid gap-4 w-fit max-w-full mx-auto">
                {benefits.map((benefit) => (
                  <li key={benefit} className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-green-400 mt-0.5 flex-shrink-0" />
                    <span className="text-white/90">{benefit}</span>
                  </li>
                ))}
              </ul>
            </AnimatedSection>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20">
        <div className="container mx-auto px-4 text-center">
          <AnimatedSection>
            <h2 className="font-display text-3xl md:text-4xl font-bold mb-4 text-white">
              Ready to Get Organized?
            </h2>
            <p className="text-white/80 mb-8 max-w-xl mx-auto">
              Paste a job link and let AI fill in the details, follow every application from applied to offer,
              and see exactly where your job search stands. Free to use with your Google account.
            </p>
            
            {!user && (
              <Button 
                asChild 
                size="lg"
                className="bg-white text-black hover:bg-white/90 hover:scale-105 hover:shadow-lg hover:shadow-white/20 rounded-full gap-2 font-medium transition-all duration-300"
                data-hover
              >
                <Link to="/signup">
                  Start Tracking Now
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            )}
          </AnimatedSection>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 py-8 bg-black/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <Button
            asChild
            variant="outline"
            size="sm"
            className="rounded-full gap-2 border-white/30 bg-white/5 text-white hover:bg-white/15 hover:text-white"
            data-hover
          >
            <a href={REPOSITORY_URL} target="_blank" rel="noopener noreferrer">
              <Github className="h-4 w-4" />
              Contribute
            </a>
          </Button>
          <p className="text-sm text-white/80">
            Made by Vigesh
          </p>
        </div>
      </footer>
    </PageLayout>
  );
}
