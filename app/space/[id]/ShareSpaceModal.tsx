"use client";

import QRCode from "@/app/components/QRCode";
import { api } from "@/clients/api";
import {
  Button,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  type ModalProps,
  Progress,
  Tab,
  Tabs,
} from "@heroui/react";
import { IconCopy } from "@tabler/icons-react";
import { useEffect, useState } from "react";

export default function ShareSpaceModal({
  spaceId,
  ...rest
}: Omit<ModalProps, "children"> & { spaceId: string }) {
  const [mode, setMode] = useState<"token" | "otp">("token");

  // const [totp, setTOTP] = useState<string | null>(null);
  // const [totpTTL, setTOTPTTL] = useState(0);

  const [token, setToken] = useState<string | null>(
    "https://crosspace.ngrok.app/space/857795ac-22c7-4625-b918-86ecb7557c3e",
  );
  const [, setTokenTTL] = useState(0);

  const [otp, setOTP] = useState<string | null>(null);
  const [otpTTL, setOTPTTL] = useState(0);

  useEffect(() => {
    if (!rest.isOpen) return;

    let requestTimeout: NodeJS.Timeout | null = null;
    let ttlInterval: NodeJS.Timeout | null = null;

    if (mode === "token") fetchToken();
    else if (mode === "otp") fetchOTP();
    // if (mode === "qr-code") fetchTOTP();
    // else if (mode === "otp") fetchOTP();

    return () => {
      if (requestTimeout) clearTimeout(requestTimeout);
      if (ttlInterval) clearInterval(ttlInterval);
    };

    async function fetchToken() {
      if (requestTimeout) clearTimeout(requestTimeout);
      if (ttlInterval) clearInterval(ttlInterval);

      const res = await api(`/spaces/${spaceId}/token`);

      if (!res.ok) throw new Error("Couldn't fetch space token.");

      const { token, ttl } = (await res.json()) as {
        token: string;
        ttl: number;
      };

      setToken(token);
      setTokenTTL(ttl);

      requestTimeout = setTimeout(fetchOTP, ttl * 1000);
    }

    async function fetchOTP() {
      if (requestTimeout) clearTimeout(requestTimeout);
      if (ttlInterval) clearInterval(ttlInterval);

      const res = await api(`/spaces/${spaceId}/otp`);

      if (!res.ok) throw new Error("Couldn't fetch space otp.");

      const { otp, ttl } = (await res.json()) as { otp: string; ttl: number };

      setOTP(otp);
      setOTPTTL(ttl);

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

  const spaceUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/space/${spaceId}?token=${token}`;

  return (
    <Modal placement="center" {...rest}>
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader>Share Space</ModalHeader>
            <ModalBody className="flex flex-col items-center">
              <Tabs
                className="w-full"
                selectedKey={mode}
                onSelectionChange={(mode) => setMode(mode as any)}
                classNames={{ tabList: "w-full", panel: "w-full" }}
              >
                <Tab title="QR-Code / Link" key="token">
                  <div className="flex flex-col items-center gap-2">
                    <p className="text-theme-primary font-semibold">
                      Scan the QR code to connect:
                    </p>
                    <div className="flex w-full flex-col items-center gap-3">
                      <QRCode value={spaceUrl} />
                      <Input
                        className="w-full"
                        value={spaceUrl}
                        type="text"
                        endContent={
                          <button
                            className="cursor-pointer"
                            onClick={() => {
                              navigator.clipboard.writeText(spaceUrl);
                            }}
                          >
                            <IconCopy />
                          </button>
                        }
                      />
                    </div>
                  </div>
                </Tab>
                <Tab title="One-Time Code" key="otp">
                  <div className="flex flex-col items-center gap-2">
                    <p className="text-theme-primary text-center font-semibold">
                      Use this code to connect from other devices:
                    </p>
                    {otp && (
                      <div className="flex w-full flex-col gap-2">
                        <p className="flex justify-between text-5xl">
                          <span className="font-black">{otp.slice(0, 3)}</span>
                          <span className="font-black">{otp.slice(3, 6)}</span>
                          <span className="font-black">{otp.slice(6)}</span>
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
                </Tab>
              </Tabs>
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
