import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  LayoutAnimation,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import {
  downloadDetail,
  downloadFraction,
  faDigits,
  fileBadge,
  summarizeDownloads,
  type DownloadItem,
  type DownloadSummary,
} from "@/lib/downloads";

const BRAND = "#dc2626";
/** The site's own typeface (IRANSansX), bundled with the app's fonts. */
export const SITE_FONT = "IRANSansX";
const SUCCESS = "#16a34a";
// The site's popover surfaces (`--popover`), so the tray reads as part of it.
export const SURFACE = {
  light: {
    card: "#ffffff",
    border: "#e8e8ec",
    text: "#101010",
    muted: "#6b6b73",
    track: "#efeff2",
    soft: "#f6f6f8",
    scrim: "rgba(0,0,0,0.18)",
  },
  dark: {
    card: "#242424",
    border: "#333333",
    text: "#f5f5f7",
    muted: "#a1a1aa",
    track: "#353538",
    soft: "#2c2c2e",
    scrim: "rgba(0,0,0,0.42)",
  },
};

/** Sideways travel before a drag becomes a swipe; less stays a tap or a scroll. */
const SWIPE_SLOP = 10;
/** How far ahead (ms) a release projects the finger's momentum. */
const SWIPE_PROJECTION_MS = 180;
/** A release this fast (px/ms) toward the edge always throws the card away. */
const SWIPE_FLING = 0.75;
/** …and one projected past this share of the screen does too. */
const SWIPE_DISTANCE = 0.42;

/** A settled tray folds away on its own unless the viewer has it open. */
const AUTO_HIDE_MS = 4500;
const RING = 44;
const RING_STROKE = 3.5;
const RING_RADIUS = (RING - RING_STROKE) / 2;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const smoothLayout = () =>
  LayoutAnimation.configureNext({
    duration: 260,
    create: { type: "easeInEaseOut", property: "opacity" },
    update: { type: "spring", springDamping: 0.82 },
    delete: { type: "easeInEaseOut", property: "opacity" },
  });

/** Eases to `target` whenever it changes, for bars and rings. */
function useEased(target: number, native: boolean) {
  const [value] = useState(() => new Animated.Value(target));
  useEffect(() => {
    Animated.timing(value, {
      toValue: target,
      duration: 220,
      easing: Easing.out(Easing.quad),
      useNativeDriver: native,
    }).start();
  }, [native, target, value]);
  return value;
}

/** An endlessly sweeping 0..1, for progress of unknown size. */
function useSweep(active: boolean) {
  const [value] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!active) return;
    const loop = Animated.loop(
      Animated.timing(value, {
        toValue: 1,
        duration: 1100,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => {
      loop.stop();
      value.setValue(0);
    };
  }, [active, value]);
  return value;
}

function ProgressBar({
  fraction,
  color,
  track,
  flush = false,
}: {
  fraction: number | null;
  color: string;
  track: string;
  /** Along the card's bottom edge instead of under a row's text. */
  flush?: boolean;
}) {
  const eased = useEased(fraction ?? 0, true);
  const sweep = useSweep(fraction === null);
  const [width, setWidth] = useState(0);
  return (
    <View
      style={[styles.bar, flush && styles.barFlush, { backgroundColor: track }]}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      {fraction === null ? (
        <Animated.View
          style={[
            styles.barSweep,
            {
              backgroundColor: color,
              width: width * 0.35,
              transform: [
                {
                  translateX: sweep.interpolate({
                    inputRange: [0, 1],
                    outputRange: [width, -width * 0.35],
                  }),
                },
              ],
            },
          ]}
        />
      ) : (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            styles.barFill,
            {
              backgroundColor: color,
              // Fills from the right, the way Persian reads.
              transformOrigin: "right",
              transform: [{ scaleX: eased }],
            },
          ]}
        />
      )}
    </View>
  );
}

function Ring({
  summary,
  count,
  colors,
}: {
  summary: DownloadSummary;
  count: number;
  colors: (typeof SURFACE)["light"];
}) {
  const settled = summary.active === 0;
  const failedOnly = settled && summary.done === 0 && summary.failed > 0;
  const fraction = settled ? 1 : summary.fraction;
  const eased = useEased(fraction ?? 0.28, false);
  const sweep = useSweep(fraction === null);
  const stroke = failedOnly ? BRAND : settled ? SUCCESS : BRAND;

  return (
    <View style={styles.ring}>
      <Animated.View
        style={
          fraction === null
            ? {
                transform: [
                  {
                    rotate: sweep.interpolate({
                      inputRange: [0, 1],
                      outputRange: ["0deg", "360deg"],
                    }),
                  },
                ],
              }
            : undefined
        }
      >
        <Svg width={RING} height={RING}>
          <Circle
            cx={RING / 2}
            cy={RING / 2}
            r={RING_RADIUS}
            stroke={colors.track}
            strokeWidth={RING_STROKE}
            fill="none"
          />
          <AnimatedCircle
            cx={RING / 2}
            cy={RING / 2}
            r={RING_RADIUS}
            stroke={stroke}
            strokeWidth={RING_STROKE}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${RING_LENGTH} ${RING_LENGTH}`}
            strokeDashoffset={eased.interpolate({
              inputRange: [0, 1],
              outputRange: [RING_LENGTH, 0],
            })}
            // Starts at twelve o'clock and runs counter-clockwise (RTL).
            transform={`translate(${RING} 0) scale(-1 1) rotate(-90 ${RING / 2} ${RING / 2})`}
          />
        </Svg>
      </Animated.View>
      <View style={styles.ringCenter} pointerEvents="none">
        {failedOnly ? (
          <Text style={[styles.ringMark, { color: BRAND }]}>!</Text>
        ) : settled ? (
          <CheckIcon color={SUCCESS} size={20} />
        ) : count > 1 ? (
          <Text style={[styles.ringCount, { color: colors.text }]}>
            {faDigits(count)}
          </Text>
        ) : (
          <ArrowDownIcon color={colors.text} />
        )}
      </View>
    </View>
  );
}

function headline(items: DownloadItem[], summary: DownloadSummary) {
  const media = items.every((item) => item.kind === "media");
  const noun = media
    ? "رسانه"
    : items.every((item) => item.kind === "file")
      ? "فایل"
      : "مورد";
  if (items.length === 1) {
    return { title: items[0].name, subtitle: downloadDetail(items[0]) };
  }
  if (summary.active > 0) {
    const percent =
      summary.fraction === null
        ? null
        : `${faDigits(Math.floor(summary.fraction * 100))}٪`;
    const finished = summary.done
      ? `${faDigits(summary.done)} از ${faDigits(items.length)} تمام شد`
      : "برای دیدن جزئیات بزنید";
    return {
      title: `${media ? "ذخیرهٔ" : "دریافت"} ${faDigits(summary.active)} ${noun}`,
      subtitle: percent ? `${percent} · ${finished}` : finished,
    };
  }
  if (summary.failed && !summary.done) {
    return {
      title: `${faDigits(summary.failed)} ${noun} دریافت نشد`,
      subtitle: "برای تلاش دوباره بزنید",
    };
  }
  return {
    title: `${faDigits(summary.done)} ${noun} ${media ? "در گالری ذخیره شد" : "دریافت شد"}`,
    subtitle: summary.failed
      ? `${faDigits(summary.failed)} مورد ناموفق · برای جزئیات بزنید`
      : "برای دیدن جزئیات بزنید",
  };
}

function Row({
  item,
  colors,
  onCancel,
  onRetry,
  onOpen,
}: {
  item: DownloadItem;
  colors: (typeof SURFACE)["light"];
  onCancel: (id: string) => void;
  onRetry: (item: DownloadItem) => void;
  onOpen: (item: DownloadItem) => void;
}) {
  const badge = fileBadge(item.name, item.kind);
  const failed = item.status === "failed";
  const done = item.status === "done";
  const openable = done && item.kind === "file";

  return (
    <View style={styles.row}>
      <Pressable
        disabled={!openable && !failed}
        onPress={() => (failed ? onRetry(item) : onOpen(item))}
        style={({ pressed }) => [styles.rowMain, pressed && styles.pressed]}
        accessibilityRole={openable || failed ? "button" : undefined}
        accessibilityLabel={`${item.name}، ${downloadDetail(item)}`}
      >
        <View style={[styles.badge, { backgroundColor: `${badge.color}1f` }]}>
          <Text
            style={[styles.badgeText, { color: badge.color }]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {badge.label}
          </Text>
          {done && (
            <View style={[styles.badgeCheck, { borderColor: colors.card }]}>
              <CheckIcon color="#ffffff" size={10} />
            </View>
          )}
        </View>
        <View style={styles.rowBody}>
          <Text
            style={[styles.rowName, { color: colors.text }]}
            numberOfLines={1}
          >
            {item.name}
          </Text>
          <Text
            style={[styles.rowDetail, { color: failed ? BRAND : colors.muted }]}
            numberOfLines={1}
          >
            {downloadDetail(item)}
          </Text>
          {item.status === "downloading" && (
            <ProgressBar
              fraction={downloadFraction(item)}
              color={BRAND}
              track={colors.track}
            />
          )}
        </View>
      </Pressable>
      <Pressable
        hitSlop={8}
        onPress={() =>
          item.status === "downloading"
            ? onCancel(item.id)
            : failed
              ? onRetry(item)
              : openable
                ? onOpen(item)
                : onCancel(item.id)
        }
        style={({ pressed }) => [
          styles.rowAction,
          { backgroundColor: colors.soft },
          pressed && styles.pressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={
          item.status === "downloading"
            ? "لغو دریافت"
            : failed
              ? "تلاش دوباره"
              : openable
                ? "باز کردن"
                : "برداشتن از فهرست"
        }
      >
        {item.status === "downloading" ? (
          <CloseIcon color={colors.text} size={14} />
        ) : failed ? (
          <RetryIcon color={BRAND} />
        ) : openable ? (
          <OpenIcon color={colors.text} />
        ) : (
          <CloseIcon color={colors.muted} size={13} />
        )}
      </Pressable>
    </View>
  );
}

/**
 * Downloads in the style of the site's floating cards: a compact card with a
 * combined progress ring that opens into the list of every download, each with
 * its own progress, cancel, retry and open.
 */
export function DownloadTray({
  items: allItems,
  theme,
  bottom,
  onCancel,
  onRetry,
  onOpen,
  onClearSettled,
  onHeightChange,
  hidden = false,
}: {
  items: DownloadItem[];
  theme: "light" | "dark";
  /** Distance from the screen's bottom; the card springs to follow it. */
  bottom: number;
  /** Steps aside (downloads keep running), e.g. for the site's audio player. */
  hidden?: boolean;
  onCancel: (id: string) => void;
  onRetry: (item: DownloadItem) => void;
  onOpen: (item: DownloadItem) => void;
  onClearSettled: () => void;
  /** The card's height while it is up, so toasts can sit above it. */
  onHeightChange: (height: number) => void;
}) {
  const colors = SURFACE[theme];
  const { width: screenWidth } = useWindowDimensions();
  // Swiped away: these downloads keep running out of sight, and the card
  // comes back for the next new one.
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const items = useMemo(
    () => allItems.filter((item) => !dismissed.has(item.id)),
    [allItems, dismissed],
  );
  const [expanded, setExpanded] = useState(false);
  // The last non-empty list stays on screen while the card slides away.
  const [shown, setShown] = useState(items);
  const [presence] = useState(() => new Animated.Value(0));
  const [scrim] = useState(() => new Animated.Value(0));
  const [chevron] = useState(() => new Animated.Value(0));
  const [lift] = useState(() => new Animated.Value(bottom));
  const [swipe] = useState(() => new Animated.Value(0));
  const visible = items.length > 0 && !hidden;
  const summary = summarizeDownloads(items);

  if (visible && shown !== items) setShown(items);
  if (!visible && expanded) setExpanded(false);

  const heightRef = useRef(0);
  useEffect(() => {
    if (!visible) onHeightChange(0);
    else if (heightRef.current) onHeightChange(heightRef.current);
  }, [onHeightChange, visible]);

  // Coming back after a swipe: in from where it rests, not from the edge.
  useEffect(() => {
    if (visible) swipe.setValue(0);
  }, [swipe, visible]);

  useEffect(() => {
    Animated.spring(presence, {
      toValue: visible ? 1 : 0,
      damping: 18,
      stiffness: 220,
      mass: 0.9,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !visible) setShown([]);
    });
  }, [presence, visible]);

  useEffect(() => {
    Animated.timing(scrim, {
      toValue: expanded ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
    Animated.timing(chevron, {
      toValue: expanded ? 1 : 0,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [chevron, expanded, scrim]);

  // Follows the site's bottom navigation as it slides in and out.
  useEffect(() => {
    Animated.spring(lift, {
      toValue: bottom,
      damping: 22,
      stiffness: 240,
      mass: 0.9,
      useNativeDriver: true,
    }).start();
  }, [bottom, lift]);

  // A swipe only counts up; the downloads on screen at that moment are then
  // set aside here, and the finished ones cleared.
  const [dismissals, setDismissals] = useState(0);
  const [handledDismissals, setHandledDismissals] = useState(0);
  if (dismissals !== handledDismissals) {
    setHandledDismissals(dismissals);
    setDismissed(new Set(allItems.map((item) => item.id)));
  }
  useEffect(() => {
    if (handledDismissals) onClearSettled();
  }, [handledDismissals, onClearSettled]);

  /**
   * Telegram-style swipe to dismiss. The card tracks the finger 1:1 and fades
   * with distance; on release the finger's momentum is projected ahead, so a
   * short flick throws it off just like a long drag, while a hesitant or
   * reversed drag springs back. Either way the motion continues at the
   * finger's own speed.
   *
   * Built once per screen width: rebuilding it whenever progress arrives
   * would reset a drag in flight.
   */
  const pan = useMemo(() => {
    const settle = (vx: number) =>
      Animated.spring(swipe, {
        toValue: 0,
        velocity: vx,
        stiffness: 320,
        damping: 26,
        mass: 0.9,
        useNativeDriver: true,
      }).start();
    return PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, gesture) =>
        Math.abs(gesture.dx) > SWIPE_SLOP &&
        Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.4,
      onPanResponderGrant: () => {
        // Caught mid-flight: carry on from where it is.
        swipe.stopAnimation();
        swipe.extractOffset();
      },
      onPanResponderMove: (_, gesture) => swipe.setValue(gesture.dx),
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: (_, gesture) => {
        swipe.flattenOffset();
        swipe.stopAnimation((x) => {
          const projected = x + gesture.vx * SWIPE_PROJECTION_MS;
          const flung =
            Math.abs(gesture.vx) > SWIPE_FLING &&
            Math.sign(gesture.vx) === Math.sign(x);
          if (!flung && Math.abs(projected) < screenWidth * SWIPE_DISTANCE) {
            settle(gesture.vx);
            return;
          }
          const direction = Math.sign(projected || x || gesture.vx) || 1;
          Animated.spring(swipe, {
            toValue: direction * (screenWidth + 32),
            // Never slower than a brisk throw, so a slow drag past the line still leaves.
            velocity: direction * Math.max(Math.abs(gesture.vx), 1.2),
            stiffness: 180,
            damping: 24,
            overshootClamping: true,
            restDisplacementThreshold: 4,
            useNativeDriver: true,
          }).start(({ finished }) => {
            if (finished) setDismissals((count) => count + 1);
          });
        });
      },
      onPanResponderTerminate: (_, gesture) => {
        swipe.flattenOffset();
        settle(gesture.vx);
      },
    });
  }, [screenWidth, swipe]);

  const settled = items.length > 0 && summary.active === 0;
  useEffect(() => {
    if (!settled || expanded) return;
    const timer = setTimeout(onClearSettled, AUTO_HIDE_MS);
    return () => clearTimeout(timer);
  }, [expanded, onClearSettled, settled]);

  if (!shown.length) return null;
  const list = visible ? items : shown;
  const head = headline(list, summarizeDownloads(list));
  const single = list.length === 1 ? list[0] : null;
  const hasSettled = list.some((item) => item.status !== "downloading");

  const toggle = () => {
    smoothLayout();
    setExpanded((value) => !value);
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View
        pointerEvents={expanded ? "auto" : "none"}
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: colors.scrim, opacity: scrim },
        ]}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={toggle}
          accessibilityLabel="بستن فهرست دریافت‌ها"
        />
      </Animated.View>
      <Animated.View
        {...pan.panHandlers}
        accessibilityActions={[{ name: "escape", label: "کنار گذاشتن" }]}
        onAccessibilityAction={() => setDismissals((count) => count + 1)}
        onLayout={(event) => {
          heightRef.current = event.nativeEvent.layout.height;
          if (visible) onHeightChange(heightRef.current);
        }}
        style={[
          styles.card,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            opacity: Animated.multiply(
              presence,
              swipe.interpolate({
                inputRange: [-screenWidth, 0, screenWidth],
                outputRange: [0, 1, 0],
                extrapolate: "clamp",
              }),
            ),
            transform: [
              { translateX: swipe },
              {
                translateY: Animated.add(
                  Animated.multiply(lift, -1),
                  presence.interpolate({
                    inputRange: [0, 1],
                    outputRange: [28, 0],
                  }),
                ),
              },
              {
                scale: presence.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.96, 1],
                }),
              },
            ],
          },
        ]}
      >
        {expanded ? (
          <View style={styles.sheetHeader}>
            <View style={styles.sheetTitleRow}>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>
                دریافت‌ها
              </Text>
              <View
                style={[styles.countPill, { backgroundColor: colors.soft }]}
              >
                <Text style={[styles.countText, { color: colors.muted }]}>
                  {faDigits(list.length)}
                </Text>
              </View>
            </View>
            <View style={styles.sheetActions}>
              {hasSettled && (
                <Pressable
                  hitSlop={8}
                  onPress={onClearSettled}
                  style={({ pressed }) => [
                    styles.clear,
                    { backgroundColor: colors.soft },
                    pressed && styles.pressed,
                  ]}
                  accessibilityRole="button"
                >
                  <Text style={[styles.clearText, { color: colors.text }]}>
                    پاک کردن
                  </Text>
                </Pressable>
              )}
              <Chevron chevron={chevron} color={colors.text} onPress={toggle} />
            </View>
          </View>
        ) : (
          <View style={styles.summary}>
            <Pressable
              onPress={() =>
                single?.status === "done" && single.kind === "file"
                  ? onOpen(single)
                  : single?.status === "failed"
                    ? onRetry(single)
                    : toggle()
              }
              style={styles.summaryMain}
              accessibilityRole="button"
              accessibilityLabel={`${head.title}، ${head.subtitle}`}
            >
              <Ring
                summary={summarizeDownloads(list)}
                count={summary.active}
                colors={colors}
              />
              <View style={styles.summaryBody}>
                <Text
                  style={[styles.summaryTitle, { color: colors.text }]}
                  numberOfLines={1}
                >
                  {head.title}
                </Text>
                <Text
                  style={[styles.summarySubtitle, { color: colors.muted }]}
                  numberOfLines={1}
                >
                  {head.subtitle}
                </Text>
              </View>
            </Pressable>
            {single?.status === "downloading" ? (
              <Pressable
                hitSlop={10}
                onPress={() => onCancel(single.id)}
                style={({ pressed }) => [
                  styles.rowAction,
                  { backgroundColor: colors.soft },
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="لغو دریافت"
              >
                <CloseIcon color={colors.text} size={14} />
              </Pressable>
            ) : (
              <Chevron chevron={chevron} color={colors.text} onPress={toggle} />
            )}
          </View>
        )}

        {expanded && (
          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          >
            {list.map((item, index) => (
              <View key={item.id}>
                {index > 0 && (
                  <View
                    style={[styles.divider, { backgroundColor: colors.border }]}
                  />
                )}
                <Row
                  item={item}
                  colors={colors}
                  onCancel={onCancel}
                  onRetry={onRetry}
                  onOpen={onOpen}
                />
              </View>
            ))}
          </ScrollView>
        )}

        {!expanded && summary.active > 0 && (
          <View style={styles.edge}>
            <ProgressBar
              fraction={summary.fraction}
              color={BRAND}
              track="transparent"
              flush
            />
          </View>
        )}
      </Animated.View>
    </View>
  );
}

function Chevron({
  chevron,
  color,
  onPress,
}: {
  chevron: Animated.Value;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      hitSlop={10}
      onPress={onPress}
      style={styles.chevron}
      accessibilityRole="button"
      accessibilityLabel="فهرست دریافت‌ها"
    >
      <Animated.View
        style={{
          transform: [
            {
              rotate: chevron.interpolate({
                inputRange: [0, 1],
                outputRange: ["0deg", "180deg"],
              }),
            },
          ],
        }}
      >
        <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
          <Path
            d="m6 14.5 6-6 6 6"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </Animated.View>
    </Pressable>
  );
}

export function CheckIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="m5 12.5 4.5 4.5L19 7.5"
        stroke={color}
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function ArrowDownIcon({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 4.5v12m0 0-5-5m5 5 5-5M5.5 19.5h13"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function CloseIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="m6 6 12 12M18 6 6 18"
        stroke={color}
        strokeWidth={2.4}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function RetryIcon({ color }: { color: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path
        d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4"
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function OpenIcon({ color }: { color: string }) {
  return (
    <Svg width={15} height={15} viewBox="0 0 24 24" fill="none">
      <Path
        d="M14 5h5v5m0-5-8 8M10 5H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  card: {
    position: "absolute",
    bottom: 0,
    left: 12,
    right: 12,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.2,
    shadowRadius: 28,
    elevation: 14,
  },
  summary: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  summaryMain: {
    flex: 1,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 12,
  },
  summaryBody: { flex: 1, minWidth: 0 },
  summaryTitle: {
    fontFamily: SITE_FONT,
    fontWeight: "700",
    fontSize: 14,
    textAlign: "right",
    writingDirection: "rtl",
  },
  summarySubtitle: {
    fontFamily: SITE_FONT,
    fontWeight: "400",
    fontSize: 12,
    marginTop: 1,
    textAlign: "right",
    writingDirection: "rtl",
  },
  ring: { width: RING, height: RING },
  ringCenter: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
  ringCount: { fontFamily: SITE_FONT, fontWeight: "700", fontSize: 15 },
  ringMark: { fontFamily: SITE_FONT, fontWeight: "700", fontSize: 18 },
  edge: { position: "absolute", left: 0, right: 0, bottom: 0 },
  chevron: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
  },
  sheetTitleRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  sheetTitle: { fontFamily: SITE_FONT, fontWeight: "700", fontSize: 16 },
  countPill: {
    minWidth: 24,
    height: 22,
    paddingHorizontal: 7,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  countText: { fontFamily: SITE_FONT, fontWeight: "500", fontSize: 12 },
  sheetActions: { flexDirection: "row", alignItems: "center", gap: 6 },
  clear: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  clearText: { fontFamily: SITE_FONT, fontWeight: "500", fontSize: 12.5 },
  list: { maxHeight: 330 },
  listContent: { paddingBottom: 8 },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginRight: 68,
    marginLeft: 16,
  },
  row: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  rowMain: {
    flex: 1,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 12,
  },
  badge: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: { fontFamily: SITE_FONT, fontWeight: "700", fontSize: 11.5 },
  badgeCheck: {
    position: "absolute",
    bottom: -3,
    left: -3,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    backgroundColor: SUCCESS,
    alignItems: "center",
    justifyContent: "center",
  },
  rowBody: { flex: 1, minWidth: 0 },
  rowName: {
    fontFamily: SITE_FONT,
    fontWeight: "700",
    fontSize: 14,
    textAlign: "right",
    writingDirection: "rtl",
  },
  rowDetail: {
    fontFamily: SITE_FONT,
    fontWeight: "400",
    fontSize: 11.5,
    marginTop: 1,
    textAlign: "right",
    writingDirection: "rtl",
  },
  rowAction: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  bar: {
    height: 3,
    borderRadius: 2,
    overflow: "hidden",
    marginTop: 7,
  },
  barFlush: { marginTop: 0, borderRadius: 0 },
  barFill: { borderRadius: 2 },
  barSweep: { position: "absolute", top: 0, bottom: 0, borderRadius: 2 },
  pressed: { opacity: 0.6 },
});
