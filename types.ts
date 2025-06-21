export type FileMetadata = {
  id: string;
  deviceId: string;
  name: string;
  type: string;
  size: number;
  thumbnail?: string;
};

export type DeviceMetadata = {
  id: string;
  userAgent: string;
};

export type RTCConnection = {
  targetDeviceId: string;
  peer: RTCPeerConnection;
  dataChannel: RTCDataChannel | null;
  pendingCandidates: RTCIceCandidate[];
};

export type RTCTrasnfer = {
  id: string;
  type: "in" | "out";
  deviceId: string;
  file: FileMetadata;
  transferedBytes: number;
};

export type RTCTransferState = "init" | "ongoing" | "paused" | "done";
