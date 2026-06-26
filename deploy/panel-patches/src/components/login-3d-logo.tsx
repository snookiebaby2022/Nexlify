"use client";

/** CSS 3D Nexlify mark — no WebGL dependency. */
export function Login3dLogo({ size = "lg" }: { size?: "sm" | "md" | "lg" }) {
  const dim = size === "lg" ? 112 : size === "md" ? 92 : 64;
  const cube = size === "lg" ? "56px" : size === "md" ? "46px" : "32px";
  return (
    <div
      className="login-3d-scene mx-auto"
      style={{ width: dim, height: dim, ["--login-cube" as string]: cube }}
      aria-hidden
    >
      <div className="login-3d-orbit">
        <div className="login-3d-cube">
          <div className="login-3d-face login-3d-face--front">
            <span>N</span>
          </div>
          <div className="login-3d-face login-3d-face--back">
            <span>X</span>
          </div>
          <div className="login-3d-face login-3d-face--right" />
          <div className="login-3d-face login-3d-face--left" />
          <div className="login-3d-face login-3d-face--top" />
          <div className="login-3d-face login-3d-face--bottom" />
        </div>
        <div className="login-3d-glow" />
      </div>
    </div>
  );
}
