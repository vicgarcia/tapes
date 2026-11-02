import { useEffect, useRef } from 'react';
import { Icon } from '@app/components/common/Icon';

const SHORTCUTS: [string[], string][] = [
    [['Space', 'K'], 'Play / pause'],
    [['←', '→'], 'Back / forward 10 seconds'],
    [['Shift', '←', '→'], 'Back / forward 1 minute'],
    [['[', ']'], 'Slower / faster (1× 2× 4×)'],
    [['1', '2', '4'], 'Set speed'],
    [['L'], 'Jump to live'],
    [['F'], 'Fullscreen'],
    [['?'], 'Show these shortcuts'],
];

/** `?` overlay listing the player's keyboard shortcuts. */
export function ShortcutsHelp({ onClose }: { onClose: () => void }) {
    const closeRef = useRef<HTMLButtonElement>(null);
    useEffect(() => {
        const previous = document.activeElement as HTMLElement | null;
        closeRef.current?.focus();
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Tab') {
                e.preventDefault();
                closeRef.current?.focus();
            }
            if (e.key === 'Escape' || e.key === '?') {
                e.preventDefault();
                e.stopPropagation();
                onClose();
            }
        };
        window.addEventListener('keydown', onKey, true);
        return () => {
            window.removeEventListener('keydown', onKey, true);
            previous?.focus();
        };
    }, [onClose]);

    return <div className="modal" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="modal-panel shortcuts">
            <div className="shortcuts-head">
                <h2><Icon name="keyboard" size={20} />Keyboard shortcuts</h2>
                <button className="btn-icon" onClick={onClose} aria-label="Close" ref={closeRef}><Icon name="close" size={20} /></button>
            </div>
            <dl>
                {SHORTCUTS.map(([keys, label]) => <div key={label} className="shortcut">
                    <dt>{keys.map(k => <kbd key={k}>{k}</kbd>)}</dt>
                    <dd>{label}</dd>
                </div>)}
            </dl>
        </div>
    </div>;
}
