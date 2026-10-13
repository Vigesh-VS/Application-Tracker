import { useState, useEffect } from 'react';
import { ArrowUp } from 'lucide-react';
import { cn } from '@/lib/utils';

export function BackToTop() {
  const [visible, setVisible] = useState(false);
  const [bottomOffset, setBottomOffset] = useState(24);

  useEffect(() => {
    const handleScroll = () => {
      setVisible(window.scrollY > 300);
      
      // Adjust position when near footer
      const footer = document.querySelector('footer');
      if (footer) {
        const footerRect = footer.getBoundingClientRect();
        const windowHeight = window.innerHeight;
        
        if (footerRect.top < windowHeight) {
          // Footer is visible, move button above it
          const newOffset = windowHeight - footerRect.top + 24;
          setBottomOffset(newOffset);
        } else {
          setBottomOffset(24);
        }
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <button
      onClick={scrollToTop}
      style={{ bottom: `${bottomOffset}px` }}
      className={cn(
        'fixed right-6 z-50 p-3 rounded-full transition-all duration-300',
        'bg-white/10 backdrop-blur-xl border border-white/20 shadow-lg shadow-black/20',
        'hover:scale-110 hover:bg-white/20 active:scale-95',
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
      )}
      aria-label="Back to top"
    >
      <ArrowUp className="h-5 w-5 text-white" />
    </button>
  );
}
