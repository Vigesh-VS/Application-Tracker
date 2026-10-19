import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, renderHook, screen, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// --- Firebase fakes -----------------------------------------------------------------------
type AuthCallback = (user: unknown) => void;
const authState = vi.hoisted(() => ({ callback: null as AuthCallback | null }));
const store = vi.hoisted(() => ({ docs: new Map<string, Record<string, unknown>>() }));

vi.mock('@/lib/firebase', () => ({ app: {}, auth: {}, googleProvider: {} }));
vi.mock('@/lib/firestore', () => ({ db: {} }));
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_auth: unknown, cb: AuthCallback) => {
    authState.callback = cb;
    return () => {};
  },
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
  getDoc: vi.fn(async (ref: { path: string }) => ({
    id: ref.path.split('/').pop(),
    exists: () => store.docs.has(ref.path),
    data: () => store.docs.get(ref.path),
  })),
  setDoc: vi.fn(async (ref: { path: string }, data: Record<string, unknown>) => {
    store.docs.set(ref.path, data);
  }),
  updateDoc: vi.fn(),
  collection: vi.fn(),
  collectionGroup: vi.fn(),
  getDocs: vi.fn(),
}));

import { getDoc, setDoc } from 'firebase/firestore';
import { AuthProvider, useAuth } from '@/lib/auth';
import { useProfile } from '@/hooks/useProfile';
import { useCurrency } from '@/hooks/useCurrency';
import { useProfileCompletion } from '@/hooks/useProfileCompletion';
import { useIsAdmin } from '@/hooks/useAdmin';
import { fetchOrCreateProfile } from '@/lib/profileStore';
import Dither from '@/components/Dither';

const USER = { uid: 'u1', email: 'a@b.com' };

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  store.docs.clear();
  vi.mocked(getDoc).mockClear();
  vi.mocked(setDoc).mockClear();
  authState.callback = null;
});

describe('profile store', () => {
  it('returns the existing profile without writing', async () => {
    store.docs.set('users/u1', { full_name: 'Asha', preferred_currency: 'USD' });
    const profile = await fetchOrCreateProfile(USER as never);
    expect(profile).toMatchObject({ id: 'u1', full_name: 'Asha', preferred_currency: 'USD' });
    expect(setDoc).not.toHaveBeenCalled();
  });

  it('creates the profile on first sign-in (same fields as before)', async () => {
    const profile = await fetchOrCreateProfile(USER as never);
    expect(setDoc).toHaveBeenCalledTimes(1);
    expect(store.docs.get('users/u1')).toMatchObject({
      user_id: 'u1',
      email: 'a@b.com',
      full_name: null,
      phone: null,
      resume_url: null,
      skills: null,
      preferred_currency: 'INR',
    });
    expect(profile.id).toBe('u1');
  });
});

describe('auth + profile loading', () => {
  it('shows the app as soon as Firebase Auth knows the user (no Firestore wait)', async () => {
    let resolveRead: () => void = () => {};
    vi.mocked(getDoc).mockImplementationOnce(
      () => new Promise((resolve) => (resolveRead = () => resolve({ id: 'u1', exists: () => true, data: () => ({}) } as never)))
    );
    function Probe() {
      const { user, loading } = useAuth();
      return <div>{loading ? 'loading' : user ? 'signed-in' : 'signed-out'}</div>;
    }
    render(<Probe />, { wrapper });
    expect(screen.getByText('loading')).toBeInTheDocument();

    act(() => authState.callback!(USER));
    // The Firestore read is still pending, but the app is no longer blocked on it
    expect(screen.getByText('signed-in')).toBeInTheDocument();
    await waitFor(() => expect(getDoc).toHaveBeenCalledTimes(1)); // profile read started in the background
    resolveRead();
  });

  it('every profile consumer shares a single Firestore read', async () => {
    store.docs.set('users/u1', { full_name: 'Asha', preferred_currency: 'EUR' });
    const { result } = renderHook(
      () => ({ profile: useProfile(), currency: useCurrency(), completion: useProfileCompletion() }),
      { wrapper }
    );
    act(() => authState.callback!(USER));
    await waitFor(() => expect(result.current.profile.loading).toBe(false));
    expect(result.current.currency.preferredCurrency).toBe('EUR');
    expect(result.current.completion.isProfileComplete).toBe(true);
    expect(getDoc).toHaveBeenCalledTimes(1);
  });
});

describe('useIsAdmin', () => {
  it('is read once and shared by several callers', async () => {
    store.docs.set('admins/u1', { email: 'a@b.com' });
    const { result } = renderHook(() => [useIsAdmin(), useIsAdmin()], { wrapper });
    act(() => authState.callback!(USER));
    await waitFor(() => expect(result.current[0].isAdmin).toBe(true));
    expect(result.current[1].isAdmin).toBe(true);
    const adminReads = vi.mocked(getDoc).mock.calls.filter(([ref]) => (ref as { path: string }).path === 'admins/u1');
    expect(adminReads).toHaveLength(1);
  });

  it('is false and not loading when signed out', async () => {
    const { result } = renderHook(() => useIsAdmin(), { wrapper });
    act(() => authState.callback!(null));
    expect(result.current).toEqual({ isAdmin: false, loading: false });
  });
});

describe('Dither background', () => {
  it('runs the renderer in a worker when OffscreenCanvas is supported', () => {
    vi.useFakeTimers();
    const offscreen = { kind: 'offscreen' };
    const posted: Array<[unknown, unknown]> = [];
    const terminate = vi.fn();
    vi.stubGlobal('Worker', class {
      postMessage(msg: unknown, transfer: unknown) { posted.push([msg, transfer]); }
      terminate = terminate;
    });
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    const transfer = vi.fn(() => offscreen);
    Object.defineProperty(HTMLCanvasElement.prototype, 'transferControlToOffscreen', { value: transfer, configurable: true });
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');

    const { unmount } = render(<Dither pixelSize={2} />);
    act(() => vi.runAllTimers());
    expect(transfer).toHaveBeenCalledTimes(1);
    expect(posted[0][0]).toMatchObject({ type: 'init', canvas: offscreen, animated: true, options: { pixelSize: 2 } });
    expect(posted[0][1]).toEqual([offscreen]); // the canvas is transferred, not copied
    expect(getContext).not.toHaveBeenCalled(); // no WebGL work on the main thread
    unmount();
    expect(terminate).toHaveBeenCalled();

    delete (HTMLCanvasElement.prototype as { transferControlToOffscreen?: unknown }).transferControlToOffscreen;
    getContext.mockRestore();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('falls back to the main thread and degrades quietly without WebGL2', async () => {
    vi.useFakeTimers();
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    const { container, unmount } = render(<Dither />);
    expect(container.querySelector('canvas.dither-canvas')).not.toBeNull();
    act(() => vi.runAllTimers()); // deferred setup after first paint
    expect(getContext).toHaveBeenCalledWith('webgl2', expect.objectContaining({ antialias: false }));
    unmount();
    getContext.mockRestore();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
});
