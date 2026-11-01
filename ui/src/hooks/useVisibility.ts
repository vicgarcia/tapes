import { RefObject, useEffect, useState } from 'react';

/** True while the document (tab / installed app) is visible. */
export function usePageVisible(): boolean {
    const [visible, setVisible] = useState(() => document.visibilityState === 'visible');
    useEffect(() => {
        const onChange = () => setVisible(document.visibilityState === 'visible');
        document.addEventListener('visibilitychange', onChange);
        return () => document.removeEventListener('visibilitychange', onChange);
    }, []);
    return visible;
}

/** True while the element is (at least partly) on screen. */
export function useInView(ref: RefObject<Element>): boolean {
    const [inView, setInView] = useState(false);
    useEffect(() => {
        const element = ref.current;
        if (!element) return;
        if (!('IntersectionObserver' in window)) {
            setInView(true);
            return;
        }
        const observer = new IntersectionObserver(entries => {
            setInView(entries.some(entry => entry.isIntersecting));
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, [ref]);
    return inView;
}
