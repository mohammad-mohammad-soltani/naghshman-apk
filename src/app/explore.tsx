import { NativeWebShell } from '@/components/native-web-shell';

/** Prevent deep links from opening an unauthenticated template screen. */
export default function ExploreScreen() {
  return <NativeWebShell />;
}
