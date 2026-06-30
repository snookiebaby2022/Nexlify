"use client";

import type { IceServerConfig } from "@/lib/webrtc-config";

export type WebRtcPlayState = "idle" | "connecting" | "playing" | "failed";

export type WebRtcPlayHandle = {
  pc: RTCPeerConnection;
  sessionUrl: string | null;
  stop: () => Promise<void>;
};

function waitForIceGathering(pc: RTCPeerConnection, timeoutMs = 4000): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(), timeoutMs);
    pc.addEventListener("icegatheringstatechange", () => {
      if (pc.iceGatheringState === "complete") {
        clearTimeout(timer);
        resolve();
      }
    });
  });
}

/** Browser-side WHEP playback via panel API (authenticated). */
export async function startWebRtcPlayback(opts: {
  username: string;
  password: string;
  streamId: string;
  video: HTMLVideoElement;
  iceServers: IceServerConfig[];
  onState?: (s: WebRtcPlayState) => void;
}): Promise<WebRtcPlayHandle> {
  opts.onState?.("connecting");

  const pc = new RTCPeerConnection({ iceServers: opts.iceServers });
  pc.addTransceiver("video", { direction: "recvonly" });
  pc.addTransceiver("audio", { direction: "recvonly" });

  pc.ontrack = (ev) => {
    const stream = ev.streams[0] ?? new MediaStream([ev.track]);
    opts.video.srcObject = stream;
    opts.onState?.("playing");
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
      opts.onState?.("failed");
    }
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await waitForIceGathering(pc);

  const res = await fetch("/api/webrtc/whep", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: opts.username,
      password: opts.password,
      streamId: opts.streamId,
      sdp: pc.localDescription?.sdp ?? offer.sdp,
    }),
  });

  const data = (await res.json()) as {
    error?: string;
    answerSdp?: string;
    sessionUrl?: string | null;
    fallbackHlsUrl?: string;
  };

  if (!res.ok) {
    opts.onState?.("failed");
    if (data.fallbackHlsUrl && opts.video) {
      throw new Error(`WEBRTC_FALLBACK:${data.fallbackHlsUrl}`);
    }
    throw new Error(data.error ?? "WebRTC session failed");
  }

  if (!data.answerSdp) {
    opts.onState?.("failed");
    throw new Error("Missing SDP answer from gateway");
  }

  await pc.setRemoteDescription({ type: "answer", sdp: data.answerSdp });

  const sessionUrl = data.sessionUrl ?? null;

  return {
    pc,
    sessionUrl,
    stop: async () => {
      try {
        if (sessionUrl) {
          await fetch("/api/webrtc/whep", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionUrl }),
          });
        }
      } catch {
        /* ignore */
      }
      pc.close();
      opts.video.srcObject = null;
      opts.onState?.("idle");
    },
  };
}
