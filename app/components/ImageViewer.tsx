import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";

interface ImageViewerProps {
  src: string;
  alt: string;
  onCloseUrl: string;
  onPrev?: () => void;
  onNext?: () => void;
  prevUrl?: string; // Optional URL for Link based navigation
  nextUrl?: string; // Optional URL for Link based navigation
  onDelete?: () => void;
}

export default function ImageViewer({
  src,
  alt,
  onCloseUrl,
  onPrev,
  onNext,
  prevUrl,
  nextUrl,
  onDelete,
}: ImageViewerProps) {
  // Zoom and pan state
  const [scale, setScale] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const imageRef = useRef<HTMLImageElement>(null);

  // Refs for gamepad state persistence across renders
  const lastInputTimeRef = useRef(0);
  const wasActiveRef = useRef(false);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);

  // Reset zoom and pan when image changes
  useEffect(() => {
    setScale(1);
    setPanX(0);
    setPanY(0);
  }, [src]);

  // Reset pan when zooming out to fit
  useEffect(() => {
    if (scale <= 1) {
      setPanX(0);
      setPanY(0);
    }
  }, [scale]);

  // Track viewport size
  useEffect(() => {
    const updateViewportSize = () => {
      setViewportSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    updateViewportSize();
    window.addEventListener("resize", updateViewportSize);
    return () => window.removeEventListener("resize", updateViewportSize);
  }, []);

  // Track image size when it loads or viewport changes
  useEffect(() => {
    const img = imageRef.current;
    if (!img || viewportSize.width === 0 || viewportSize.height === 0) return;

    const updateImageSize = () => {
      // Calculate fitted dimensions based on natural size and viewport
      const naturalWidth = img.naturalWidth;
      const naturalHeight = img.naturalHeight;
      if (naturalWidth === 0 || naturalHeight === 0) return;

      const imageAspect = naturalWidth / naturalHeight;
      const viewportAspect = viewportSize.width / viewportSize.height;

      let fittedWidth, fittedHeight;
      if (imageAspect > viewportAspect) {
        // Image is wider relative to viewport
        fittedWidth = viewportSize.width;
        fittedHeight = viewportSize.width / imageAspect;
      } else {
        // Image is taller relative to viewport
        fittedHeight = viewportSize.height;
        fittedWidth = viewportSize.height * imageAspect;
      }

      // If natural size is smaller than viewport, use natural size
      if (naturalWidth < fittedWidth) {
        fittedWidth = naturalWidth;
        fittedHeight = naturalHeight;
      }

      setImageSize({
        width: fittedWidth,
        height: fittedHeight,
      });
    };

    if (img.complete) {
      updateImageSize();
    } else {
      img.addEventListener("load", updateImageSize);
      return () => img.removeEventListener("load", updateImageSize);
    }
  }, [src, viewportSize]);

  // Re-constrain pan values when scale or dimensions change
  useEffect(() => {
    if (scale > 1 && imageSize.width > 0 && imageSize.height > 0) {
      const scaledWidth = imageSize.width * scale;
      const scaledHeight = imageSize.height * scale;
      // Constraints need to be in unscaled pixels
      const maxPanX =
        Math.max(0, (scaledWidth - viewportSize.width) / 2) / scale;
      const maxPanY =
        Math.max(0, (scaledHeight - viewportSize.height) / 2) / scale;

      const constrainedX = Math.max(-maxPanX, Math.min(maxPanX, panX));
      const constrainedY = Math.max(-maxPanY, Math.min(maxPanY, panY));

      if (constrainedX !== panX || constrainedY !== panY) {
        setPanX(constrainedX);
        setPanY(constrainedY);
      }
    }
  }, [scale, imageSize, viewportSize]);

  // Function to constrain pan values
  const constrainPan = (x: number, y: number) => {
    if (scale <= 1 || imageSize.width === 0 || imageSize.height === 0) {
      return { x: 0, y: 0 };
    }

    // imageSize contains the fitted dimensions (displayed size at scale=1)
    const scaledWidth = imageSize.width * scale;
    const scaledHeight = imageSize.height * scale;

    // Maximum pan distance to keep image covering viewport (in unscaled pixels)
    const maxPanX = Math.max(0, (scaledWidth - viewportSize.width) / 2) / scale;
    const maxPanY =
      Math.max(0, (scaledHeight - viewportSize.height) / 2) / scale;

    return {
      x: Math.max(-maxPanX, Math.min(maxPanX, x)),
      y: Math.max(-maxPanY, Math.min(maxPanY, y)),
    };
  };

  // Pointer event handlers for panning (Mouse/Touch/VR)
  const handlePointerDown = (e: React.PointerEvent) => {
    // Only allow left click (button 0) for mice, or any touch/pen contact
    if (e.pointerType === "mouse" && e.button !== 0) return;

    e.preventDefault();
    if (scale > 1) {
      setIsDragging(true);
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    e.preventDefault();
    if (isDragging && lastPointerRef.current) {
      const deltaX = e.clientX - lastPointerRef.current.x;
      const deltaY = e.clientY - lastPointerRef.current.y;

      const newPanX = panX + deltaX / scale;
      const newPanY = panY + deltaY / scale;
      const constrained = constrainPan(newPanX, newPanY);
      setPanX(constrained.x);
      setPanY(constrained.y);

      lastPointerRef.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    lastPointerRef.current = null;
    try {
      if ((e.target as HTMLElement).hasPointerCapture(e.pointerId)) {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      }
    } catch {}
  };

  const handleWheel = (e: React.WheelEvent) => {
    // Check for horizontal scroll (navigation)
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      const now = Date.now();
      if (now - lastInputTimeRef.current > 500 && Math.abs(e.deltaX) > 20) {
        if (e.deltaX > 0 && onNext) {
          onNext();
          lastInputTimeRef.current = now;
        } else if (e.deltaX < 0 && onPrev) {
          onPrev();
          lastInputTimeRef.current = now;
        } else if (e.deltaX > 0 && nextUrl) {
          // If onNext not defined but nextUrl is (Link mode), can't auto nav easily without router navigate
          // But wrapper handles navigation clicks.
          // We rely on parent providing onNext/onPrev for programmatic Nav from here mostly.
        }
      }
      return;
    }

    if (e.deltaY < 0) {
      setScale((prev) => Math.min(prev * 1.2, 5)); // Max zoom 5x
    } else if (e.deltaY > 0) {
      setScale((prev) => Math.max(prev / 1.2, 0.1)); // Min zoom 0.1x
    }
  };

  // Gamepad polling for VR/Game controllers
  useEffect(() => {
    let animationFrameId: number;

    const pollGamepad = () => {
      const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
      let inputDetected = false;

      // Check first few gamepads
      for (let i = 0; i < Math.min(gamepads.length, 2); i++) {
        const gp = gamepads[i];
        if (gp) {
          const axisX = gp.axes[0];
          const axisY = gp.axes[1];
          const now = Date.now();

          // Threshold for activation
          if (Math.abs(axisX) > 0.5 || Math.abs(axisY) > 0.5) {
            inputDetected = true;

            if (Math.abs(axisX) > Math.abs(axisY)) {
              // Horizontal - Navigation
              const isNewPress = !wasActiveRef.current;
              const isRepeat = now - lastInputTimeRef.current > 400; // 400ms repeat delay

              if (isNewPress || isRepeat) {
                if (axisX < -0.5) {
                  if (onPrev) {
                    onPrev();
                    lastInputTimeRef.current = now;
                    wasActiveRef.current = true;
                  }
                } else if (axisX > 0.5) {
                  if (onNext) {
                    onNext();
                    lastInputTimeRef.current = now;
                    wasActiveRef.current = true;
                  }
                }
              }
            } else {
              // Vertical - Zoom
              if (now - lastInputTimeRef.current > 100) {
                if (axisY < -0.5) {
                  setScale((prev) => Math.min(prev * 1.1, 5));
                  lastInputTimeRef.current = now;
                  wasActiveRef.current = true;
                } else if (axisY > 0.5) {
                  setScale((prev) => Math.max(prev / 1.1, 0.1));
                  lastInputTimeRef.current = now;
                  wasActiveRef.current = true;
                }
              }
            }
          }
        }
      }

      if (!inputDetected) {
        wasActiveRef.current = false;
      }

      animationFrameId = requestAnimationFrame(pollGamepad);
    };

    if (typeof navigator !== "undefined" && "getGamepads" in navigator) {
      animationFrameId = requestAnimationFrame(pollGamepad);
    }

    return () => cancelAnimationFrame(animationFrameId);
  }, [onPrev, onNext, prevUrl, nextUrl]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        if (onPrev) onPrev();
      } else if (event.key === "ArrowRight") {
        if (onNext) onNext();
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setScale((prev) => Math.min(prev * 1.2, 5)); // Max zoom 5x
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        setScale((prev) => Math.max(prev / 1.2, 0.1)); // Min zoom 0.1x
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onPrev, onNext]);

  return (
    <div
      className="fixed inset-0 bg-black flex items-center justify-center z-50"
      onWheel={handleWheel}
    >
      {/* Close button */}
      <Link
        to={onCloseUrl}
        className="absolute top-4 right-4 text-white text-2xl hover:text-gray-300 z-10"
      >
        ✕
      </Link>

      {/* Delete button */}
      {onDelete && (
        <button
          onClick={() => {
            if (window.confirm("Are you sure you want to delete this image?")) {
              onDelete();
            }
          }}
          className="absolute top-4 left-4 text-white hover:text-red-500 z-10 p-2"
          title="Delete Image"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </button>
      )}

      {/* Navigation arrows */}
      {(onPrev || prevUrl) && (
        <Wrapper
          to={prevUrl}
          onClick={onPrev}
          className="absolute left-4 top-1/2 transform -translate-y-1/2 text-white text-4xl hover:text-gray-300 z-10"
        >
          ‹
        </Wrapper>
      )}
      {(onNext || nextUrl) && (
        <Wrapper
          to={nextUrl}
          onClick={onNext}
          className="absolute right-4 top-1/2 transform -translate-y-1/2 text-white text-4xl hover:text-gray-300 z-10"
        >
          ›
        </Wrapper>
      )}

      {/* Image */}
      <img
        ref={imageRef}
        src={src}
        alt={alt}
        className="max-w-full max-h-full object-contain cursor-grab active:cursor-grabbing"
        style={{
          transform: `scale(${scale}) translate(${panX}px, ${panY}px)`,
          transformOrigin: "center center",
          transition: isDragging ? "none" : "transform 0.1s ease-out",
          touchAction: "none",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        draggable={false}
      />
    </div>
  );
}

function Wrapper({
  to,
  onClick,
  className,
  children,
}: {
  to?: string;
  onClick?: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  if (to) {
    return (
      <Link to={to} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <button onClick={onClick} className={className}>
      {children}
    </button>
  );
}
