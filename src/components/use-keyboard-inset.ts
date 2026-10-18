import { useEffect, useRef, useState, type RefObject } from "react";
import { Keyboard, Platform, type View } from "react-native";

import { keyboardOverlap } from "@/lib/keyboard-inset";

/**
 * Bottom padding that keeps `frameRef` clear of the Android soft keyboard.
 * React Native re-emits keyboardDidShow whenever the keyboard's height
 * changes, so suggestion strips and emoji panels are followed too.
 */
export function useKeyboardInset(frameRef: RefObject<View | null>) {
  const [inset, setInset] = useState(0);
  // Ignores a measurement that lands after the keyboard was hidden again.
  const keyboardEvent = useRef(0);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const show = Keyboard.addListener("keyboardDidShow", (event) => {
      const id = ++keyboardEvent.current;
      const { screenY, height } = event.endCoordinates;
      const frame = frameRef.current;
      if (!frame) {
        setInset(keyboardOverlap(Number.NaN, screenY, height));
        return;
      }
      // The inset is padding inside the frame, so its outer edge never moves.
      frame.measureInWindow((_x, y, _width, frameHeight) => {
        if (id !== keyboardEvent.current) return;
        setInset(keyboardOverlap(y + frameHeight, screenY, height));
      });
    });
    const hide = Keyboard.addListener("keyboardDidHide", () => {
      keyboardEvent.current++;
      setInset(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [frameRef]);

  return inset;
}
