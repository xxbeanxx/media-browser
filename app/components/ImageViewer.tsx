import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";

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
  const [isDebugVisible, setIsDebugVisible] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  const navigate = useNavigate();

  // Ref to track debug visibility for the gamepad loop
  const isDebugVisibleRef = useRef(false);
  useEffect(() => {
    isDebugVisibleRef.current = isDebugVisible;
  }, [isDebugVisible]);

  // Refs for gamepad state persistence across renders
  const lastInputTimeRef = useRef(0);
  const wasActiveRef = useRef(false);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  const lastKeyEventRef = useRef<string>("");

  // Need to forward declare xrSessionRef since we use it in cleanup
  const xrSessionRef = useRef<any>(null);

  // Store handlers in a ref so the XR loop can always access the latest version
  const handlersRef = useRef({ onPrev, onNext, prevUrl, nextUrl, setScale });
  useEffect(() => {
    handlersRef.current = { onPrev, onNext, prevUrl, nextUrl, setScale };
  }, [onPrev, onNext, prevUrl, nextUrl]);

  // Unified Gamepad logic
  const checkGamepadInput = () => {
    // Gather all gamepads from Navigator and WebXR
    const allGamepads: (Gamepad | null)[] = [];

    if (typeof navigator !== "undefined" && navigator.getGamepads) {
      const gps = navigator.getGamepads();
      for (let i = 0; i < gps.length; i++) allGamepads.push(gps[i]);
    }

    if (xrSessionRef.current && xrSessionRef.current.inputSources) {
      for (const source of xrSessionRef.current.inputSources) {
        if (source.gamepad) allGamepads.push(source.gamepad);
      }
    }

    let inputDetected = false;

    // Check all gamepads (Quest puts controllers at various indices)
    for (const gp of allGamepads) {
      if (gp) {
        // Standard mapping:
        // Left Stick: Axes 0 (X), 1 (Y)
        // Right Stick: Axes 2 (X), 3 (Y)
        // Quest 2D mapping: Often 2 separate gamepads, each with Stick on 0/1.

        const now = Date.now();
        const { onPrev, onNext, setScale } = handlersRef.current;

        // Helper to process an axis pair
        const processStick = (axX: number, axY: number) => {
          if (Math.abs(axX) > 0.3 || Math.abs(axY) > 0.3) {
            inputDetected = true;

            if (Math.abs(axX) > Math.abs(axY)) {
              // Horizontal - Navigation
              const isNewPress = !wasActiveRef.current;
              const isRepeat = now - lastInputTimeRef.current > 250;

              if (isNewPress || isRepeat) {
                if (axX < -0.3) {
                  if (onPrev) {
                    onPrev();
                    lastInputTimeRef.current = now;
                    wasActiveRef.current = true;
                  }
                } else if (axX > 0.3) {
                  if (onNext) {
                    onNext();
                    lastInputTimeRef.current = now;
                    wasActiveRef.current = true;
                  }
                }
              }
            } else {
              // Vertical - Zoom
              if (now - lastInputTimeRef.current > 50) {
                if (axY < -0.3) {
                  setScale((prev) => Math.min(prev * 1.05, 5));
                  lastInputTimeRef.current = now;
                  wasActiveRef.current = true;
                } else if (axY > 0.3) {
                  setScale((prev) => Math.max(prev / 1.05, 0.1));
                  lastInputTimeRef.current = now;
                  wasActiveRef.current = true;
                }
              }
            }
          }
        };

        // Check Primary Stick (Axes 0/1) - Common for Quest 2D & Left Stick
        if (gp.axes.length >= 2) {
          processStick(gp.axes[0], gp.axes[1]);
        }

        // Check Secondary Stick (Axes 2/3) - Common for Standard Right Stick
        if (gp.axes.length >= 4) {
          processStick(gp.axes[2], gp.axes[3]);
        }
      }
    }

    if (!inputDetected) {
      wasActiveRef.current = false;
    }

    // Debug overlay if requested
    if (
      isDebugVisibleRef.current ||
      (typeof window !== "undefined" &&
        window.location.search.includes("debug=gamepad"))
    ) {
      const debugDiv =
        document.getElementById("gamepad-debug") ||
        document.createElement("div");
      debugDiv.id = "gamepad-debug";
      debugDiv.style.position = "fixed";
      debugDiv.style.top = "10px";
      debugDiv.style.left = "10px";
      debugDiv.style.background = "rgba(0,0,0,0.8)";
      debugDiv.style.color = "lime";
      debugDiv.style.fontSize = "12px";
      debugDiv.style.zIndex = "9999";
      debugDiv.style.whiteSpace = "pre";
      debugDiv.style.pointerEvents = "none";
      debugDiv.style.display = "block";
      if (!debugDiv.parentElement) document.body.appendChild(debugDiv);

      let debugText = "Gamepads:\n";
      for (let i = 0; i < allGamepads.length; i++) {
        const g = allGamepads[i];
        if (g) {
          debugText += `[${i}] ${g.id}\n Axes: ${g.axes
            .map((a) => a.toFixed(2))
            .join(", ")}\n Buttons: ${g.buttons
            .map((b) => (b.pressed ? "1" : "0"))
            .join("")}\n`;
        } else {
          debugText += `[${i}] Disconnected/Null\n`;
        }
      }
      debugText += `\nLast Key: ${lastKeyEventRef.current || "None"}`;
      debugDiv.innerText = debugText;
    } else {
      const debugDiv = document.getElementById("gamepad-debug");
      if (debugDiv) debugDiv.style.display = "none";
    }
  };

  // Store the check function in a ref so the XR loop can call the logic
  const checkGamepadRef = useRef(checkGamepadInput);
  checkGamepadRef.current = checkGamepadInput;

  // Listen for gamepad connection events (Essential for Quest browser detection)
  useEffect(() => {
    const handleConnect = (e: GamepadEvent) => {
      console.log("Gamepad connected:", e.gamepad);
      // Force a manual check if needed, though the poll loop manages this.
      if (checkGamepadRef.current) checkGamepadRef.current();
    };

    const handleDisconnect = (e: GamepadEvent) => {
      console.log("Gamepad disconnected:", e.gamepad);
    };

    window.addEventListener("gamepadconnected", handleConnect);
    window.addEventListener("gamepaddisconnected", handleDisconnect);

    return () => {
      window.removeEventListener("gamepadconnected", handleConnect);
      window.removeEventListener("gamepaddisconnected", handleDisconnect);
    };
  }, []);

  // Clean up XR session if component unmounts
  useEffect(() => {
    return () => {
      // Use a local variable to capture current ref value if needed,
      // but refs are mutable so .current is what we want to check at unmount time
      if (xrSessionRef.current) {
        xrSessionRef.current
          .end()
          .catch((e: any) => console.log("Error ending session", e));
      }
    };
  }, []);

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
    // If we have recently processed an input (e.g. from Gamepad), ignore wheel
    // to prevent conflict or double-handling if browser maps stick to wheel.
    if (Date.now() - lastInputTimeRef.current < 200) return;

    // Debug info for wheel
    if (isDebugVisible) {
      lastKeyEventRef.current = `Wheel: dx=${e.deltaX.toFixed(
        0
      )}, dy=${e.deltaY.toFixed(0)}`;
    }

    // Check for horizontal scroll (navigation)
    // Quest thumbstick sends small continuous deltaX values (e.g. 3, 5, etc.)
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      const now = Date.now();
      // Lowered threshold to 10 to catch thumbstick inputs, and reduced debounce slightly
      if (now - lastInputTimeRef.current > 400 && Math.abs(e.deltaX) > 10) {
        if (e.deltaX > 0) {
          if (onNext) {
            onNext();
            lastInputTimeRef.current = now;
          } else if (nextUrl) {
            navigate(nextUrl);
            lastInputTimeRef.current = now;
          }
        } else if (e.deltaX < 0) {
          if (onPrev) {
            onPrev();
            lastInputTimeRef.current = now;
          } else if (prevUrl) {
            navigate(prevUrl);
            lastInputTimeRef.current = now;
          }
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

  // Gamepad polling for VR/Game controllers (Desktop Mode)
  useEffect(() => {
    // If in VR session, the session loop handles polling
    if (xrSessionRef.current) return;

    let animationFrameId: number;

    const pollLoop = () => {
      if (!xrSessionRef.current) {
        checkGamepadRef.current(); // Call the unified logic
      }
      animationFrameId = requestAnimationFrame(pollLoop);
    };

    if (typeof navigator !== "undefined" && "getGamepads" in navigator) {
      animationFrameId = requestAnimationFrame(pollLoop);
    }

    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      lastKeyEventRef.current = `${event.key} (${event.code})`;

      // Debounce keyboard events against gamepad events to prevent double-fire
      // if the browser maps thumbstick to arrow keys.
      if (Date.now() - lastInputTimeRef.current < 200) {
        if (event.key.startsWith("Arrow") || event.key === " ") {
          event.preventDefault();
        }
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        if (onPrev) onPrev();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
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

  const containerRef = useRef<HTMLDivElement>(null);

  const toggleFullScreen = async () => {
    // Check for secure context first (required for WebXR)
    if (
      typeof window !== "undefined" &&
      !window.isSecureContext &&
      window.location.hostname !== "localhost" &&
      window.location.hostname !== "127.0.0.1"
    ) {
      alert(
        "WebXR (VR) requires a secure context (HTTPS) or localhost. Please use HTTPS or port forwarding."
      );
      // Fallthrough to fullscreen anyway
    }

    // Try WebXR first if available
    if (typeof navigator !== "undefined" && "xr" in navigator) {
      const xr = (navigator as any).xr;
      try {
        const isSupported = await xr.isSessionSupported("immersive-vr");
        if (isSupported) {
          if (xrSessionRef.current) {
            await xrSessionRef.current.end();
            return;
          }

          const session = await xr.requestSession("immersive-vr", {
            optionalFeatures: ["dom-overlay"],
            domOverlay: { root: containerRef.current },
          });

          xrSessionRef.current = session;

          // Basic WebGL context to drive the session (required by some browsers)
          const canvas = document.createElement("canvas");
          const gl = canvas.getContext("webgl", {
            xrCompatible: true,
          } as WebGLContextAttributes) as WebGLRenderingContext | null;
          if (gl) {
            // Loop to keep session alive and render black background
            const onFrame = (t: number, frame: any) => {
              if (!xrSessionRef.current) return;

              // Poll gamepad input using the unified logic
              checkGamepadRef.current();

              const session = frame.session;
              // We don't need to do complex drawing, but we should clear the color buffer
              // to ensure a black background if the DOM overlay doesn't cover everything
              // (though DOM overlay usually sits on top).
              gl.clearColor(0.0, 0.0, 0.0, 1.0);
              gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

              session.requestAnimationFrame(onFrame);
            };

            // @ts-ignore
            const layer = new XRWebGLLayer(session, gl);
            session.updateRenderState({ baseLayer: layer });
            session.requestAnimationFrame(onFrame);
          }

          session.addEventListener("end", () => {
            xrSessionRef.current = null;
          });

          return;
        }
      } catch (e) {
        console.warn("WebXR error, falling back to fullscreen", e);
        // If the error is specific, we might want to alert it
        if ((e as any).name === "SecurityError") {
          alert("WebXR SecurityError: ensuring HTTPS access is required.");
        }
      }
    }

    // Standard Fullscreen Fallback
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch((err) => {
        console.warn("Error attempting to enable fullscreen:", err);
      });
    } else {
      document.exitFullscreen();
    }
  };

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 bg-black flex items-center justify-center z-50 touch-none overscroll-none"
      onWheel={handleWheel}
      style={{ touchAction: "none", overscrollBehavior: "none" }}
    >
      {/* Close button */}
      <Link
        to={onCloseUrl}
        className="absolute top-4 right-4 text-white text-2xl hover:text-gray-300 z-20"
      >
        ✕
      </Link>

      {/* Fullscreen / VR Toggle */}
      <button
        onClick={toggleFullScreen}
        className="absolute top-4 right-16 text-white text-2xl hover:text-gray-300 z-20 p-1"
        title="Toggle Fullscreen / VR"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className="w-6 h-6"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15"
          />
        </svg>
      </button>

      {/* Debug Toggle */}
      <button
        onClick={() => setIsDebugVisible(!isDebugVisible)}
        className="absolute top-4 right-28 text-white text-2xl hover:text-gray-300 z-20 p-1"
        title="Toggle Gamepad Debug"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className="w-6 h-6"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
          />
        </svg>
      </button>

      {/* Delete button */}
      {onDelete && (
        <button
          onClick={() => {
            if (window.confirm("Are you sure you want to delete this image?")) {
              onDelete();
            }
          }}
          className="absolute top-4 left-4 text-white hover:text-red-500 z-20 p-2"
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
          className="absolute left-0 top-0 h-full w-24 flex items-center justify-center text-white text-6xl hover:bg-white/10 hover:text-white z-10 select-none transition-colors"
        >
          ‹
        </Wrapper>
      )}
      {(onNext || nextUrl) && (
        <Wrapper
          to={nextUrl}
          onClick={onNext}
          className="absolute right-0 top-0 h-full w-24 flex items-center justify-center text-white text-6xl hover:bg-white/10 hover:text-white z-10 select-none transition-colors"
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
