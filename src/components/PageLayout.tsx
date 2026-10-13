import { ReactNode } from 'react';
import Dither from '@/components/Dither';
import { Navbar } from '@/components/Navbar';
import { BackToTop } from '@/components/BackToTop';

interface PageLayoutProps {
  children: ReactNode;
  showNavbar?: boolean;
  showBackToTop?: boolean;
}

export function PageLayout({ 
  children, 
  showNavbar = false,
  showBackToTop = false 
}: PageLayoutProps) {
  return (
    <div className="min-h-screen relative bg-black overflow-x-hidden">
      {/* Dithered waves background */}
      <div className="fixed inset-0 z-0 overflow-hidden">
        <Dither
          waveSpeed={0.025}
          waveFrequency={3}
          waveAmplitude={0.3}
          waveColor={[0.5, 0.5, 0.5]}
          colorNum={4}
          pixelSize={2}
          disableAnimation={false}
          enableMouseInteraction={true}
          mouseRadius={1}
        />
      </div>
      
      {/* Dark overlay for better text visibility */}
      <div className="fixed inset-0 z-[1] bg-black/65" />
      
      {/* Content layer */}
      <div className="relative z-10">
        {showNavbar && <Navbar />}
        {showBackToTop && <BackToTop />}
        {children}
      </div>
    </div>
  );
}
