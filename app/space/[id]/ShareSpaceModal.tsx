"use client";

import ConnectQRCode from "@/app/components/ConnectQRCode";
import { api } from "@/clients/api";
import {
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  type ModalProps,
  Progress,
} from "@heroui/react";
import { useEffect, useState } from "react";

export default function ShareSpaceModal({
  spaceId,
  ...rest
}: Omit<ModalProps, "children"> & { spaceId: string }) {
  const [mode, setMode] = useState<"qr-code" | "otp">("qr-code");

  const [totp, setTOTP] = useState<string | null>(null);
  const [totpTTL, setTOTPTTL] = useState(0);

  const [otp, setOTP] = useState<string | null>(null);
  const [otpTTL, setOTPTTL] = useState(0);

  useEffect(() => {
    if (!rest.isOpen) return;

    let requestTimeout: NodeJS.Timeout | null = null;
    let ttlInterval: NodeJS.Timeout | null = null;

    if (mode === "qr-code") fetchTOTP();
    else if (mode === "otp") fetchOTP();

    return () => {
      if (requestTimeout) clearTimeout(requestTimeout);
      if (ttlInterval) clearInterval(ttlInterval);
    };

    async function fetchTOTP() {
      const res = await api(`/spaces/${spaceId}/totp`);

      if (!res.ok) throw new Error("Couldn't fetch space totp.");

      const { totp, ttl } = (await res.json()) as { totp: string; ttl: number };

      setTOTP(totp);
      setTOTPTTL(ttl);

      if (requestTimeout) clearTimeout(requestTimeout);
      if (ttlInterval) clearInterval(ttlInterval);

      ttlInterval = setInterval(() => {
        setTOTPTTL((ttl) => {
          if (ttl > 0) {
            return ttl - 1;
          }

          return ttl;
        });
      }, 1000);
      requestTimeout = setTimeout(fetchTOTP, ttl * 1000);
    }

    async function fetchOTP() {
      const res = await api(`/spaces/${spaceId}/otp`);

      if (!res.ok) throw new Error("Couldn't fetch space otp.");

      const { otp, ttl } = (await res.json()) as { otp: string; ttl: number };

      setOTP(otp);
      setOTPTTL(ttl);

      if (requestTimeout) clearTimeout(requestTimeout);
      if (ttlInterval) clearInterval(ttlInterval);

      ttlInterval = setInterval(() => {
        setOTPTTL((ttl) => {
          if (ttl > 0) {
            return ttl - 1;
          }

          return ttl;
        });
      }, 1000);
      requestTimeout = setTimeout(fetchOTP, ttl * 1000);
    }
  }, [spaceId, mode, rest.isOpen]);

  return (
    <Modal placement="center" {...rest}>
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader>Share Space</ModalHeader>
            <ModalBody className="flex flex-col items-center">
              {mode === "qr-code" && (
                <>
                  <div className="flex flex-col items-center gap-2">
                    <p className="text-theme-primary font-semibold">
                      Scan the QR code to connect:
                    </p>
                    {totp && (
                      <div className="flex flex-col gap-2">
                        <ConnectQRCode spaceId={spaceId} totp={totp} />
                        <Progress
                          className="w-full"
                          classNames={{ indicator: "bg-theme-primary" }}
                          value={((120 - totpTTL) / 120) * 100}
                          size="sm"
                        />
                      </div>
                    )}
                  </div>
                  <button
                    className="cursor-pointer"
                    onClick={() => setMode("otp")}
                  >
                    <u>Get a one-time code instead</u>
                  </button>
                </>
              )}
              {mode === "otp" && (
                <>
                  <div className="flex flex-col items-center gap-2">
                    <p className="text-theme-primary text-center font-semibold">
                      Use this code to connect from other devices:
                    </p>
                    {otp && (
                      <div className="flex flex-col gap-2">
                        <p className="flex gap-2 text-5xl">
                          <span className="font-black">
                            {otp.slice(0, 3)}-{otp.slice(3, 6)}
                          </span>
                        </p>
                        <Progress
                          className="w-full"
                          classNames={{ indicator: "bg-theme-primary" }}
                          value={((60 - otpTTL) / 60) * 100}
                          size="sm"
                        />
                      </div>
                    )}
                  </div>
                  <button
                    className="cursor-pointer"
                    onClick={() => setMode("qr-code")}
                  >
                    <u>Use a qr-code instead</u>
                  </button>
                </>
              )}
            </ModalBody>
            <ModalFooter>
              <Button onPress={onClose}>Close</Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
