"use client";

import { api } from "@/clients/api";
import {
  Button,
  InputOtp,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  type ModalProps,
} from "@heroui/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function ConnectModal({
  ...rest
}: Omit<ModalProps, "children">) {
  const router = useRouter();
  const [otp, setOTP] = useState("");

  return (
    <Modal placement="center" {...rest}>
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader>Connect to another space</ModalHeader>
            <ModalBody className="flex flex-col items-center">
              <div className="flex flex-col items-center gap-2">
                <p className="text-theme-primary font-semibold">
                  Scan a QR code to connect
                </p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  alt="Qrcode scan"
                  className="h-42"
                  src="/qrcode-scan.png"
                />
              </div>
              <div className="flex flex-col items-center gap-2">
                <p className="text-theme-primary font-semibold">
                  Or enter a one-time code:
                </p>
                <InputOtp
                  length={6}
                  value={otp}
                  allowedKeys="^[a-zA-Z0-9]*$"
                  onValueChange={(value) => {
                    setOTP(value.toUpperCase());
                  }}
                  variant="faded"
                  size="lg"
                  radius="lg"
                  isInvalid={false}
                />
                <Button
                  className="bg-theme-primary text-white"
                  isDisabled={otp.length < 6}
                  onPress={exchangeOTP}
                >
                  Connect
                </Button>
              </div>
            </ModalBody>
            <ModalFooter>
              <Button onPress={onClose}>Close</Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );

  async function exchangeOTP() {
    const res = await api(`/spaces/exchange-otp?otp=${otp}`);
    const { spaceId } = await res.json();

    if (spaceId) router.replace(`/space/${spaceId}`);
  }
}
