"use client";

import { api } from "@/clients/api";
import {
  Button,
  cn,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  type ModalProps,
} from "@heroui/react";
import { OTPInput, SlotProps } from "input-otp";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function ConnectModal({
  ...rest
}: Omit<ModalProps, "children">) {
  const router = useRouter();
  const [otp, setOTP] = useState("");

  useEffect(() => {
    setOTP("");
  }, [rest.isOpen]);

  return (
    <Modal placement="center" {...rest}>
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader>Connect to another space</ModalHeader>
            <ModalBody className="flex flex-col items-center gap-8">
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
              <div className="flex w-full flex-col items-center gap-2">
                <p className="text-theme-primary font-semibold">
                  Or enter a one-time code:
                </p>
                <OTPInput
                  maxLength={9}
                  pattern="^[a-zA-Z0-9]*$"
                  containerClassName="group w-full overflow-hidden flex justify-between items-center has-[:disabled]:opacity-3"
                  value={otp}
                  onChange={setOTP}
                  inputMode="text"
                  pasteTransformer={(pasted) => pasted.replace(/[\s\n\r]/g, "")}
                  render={({ slots }) => (
                    <>
                      <div className="flex gap-[2px]">
                        {slots.slice(0, 3).map((slot, idx) => (
                          <Slot key={idx} {...slot} />
                        ))}
                      </div>
                      <div className="flex gap-[2px]">
                        {slots.slice(3, 6).map((slot, idx) => (
                          <Slot key={idx} {...slot} />
                        ))}
                      </div>
                      <div className="flex gap-[2px]">
                        {slots.slice(6, 9).map((slot, idx) => (
                          <Slot key={idx} {...slot} />
                        ))}
                      </div>
                    </>
                  )}
                />
                <Button
                  className="bg-theme-primary text-white"
                  isDisabled={otp.length < 9}
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
    const res = await api(`/spaces/exchange-otp?otp=${otp.toUpperCase()}`);
    const { spaceId } = await res.json();

    if (spaceId) router.replace(`/space/${spaceId}`);
  }
}

function Slot(props: SlotProps) {
  return (
    <div
      className={cn(
        "relative h-8 w-8 font-bold md:h-10 md:w-10 md:text-lg",
        "flex items-center justify-center transition",
        "border-theme-border rounded-lg border",
        "group-hover:border-accent-foreground/20 group-focus-within:border-accent-foreground/20",
        "outline-accent-foreground/20",
        { "border-theme-primary border-2": props.isActive },
      )}
    >
      {props.char !== null && <div>{props.char.toUpperCase()}</div>}
    </div>
  );
}
