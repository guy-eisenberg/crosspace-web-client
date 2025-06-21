import { RTCTransferState, RTCTrasnfer } from "@/types";
import { Modal, ModalContent, ModalProps, Tab, Tabs } from "@heroui/react";
import TransferCard from "../../components/TransferCard";

export default function TransfersModal({
  outTransfers,
  inTransfers,
  startTransfer,
  deleteTransfer,
  pauseTransfer,
  ...rest
}: Omit<ModalProps, "children"> & {
  outTransfers: (RTCTrasnfer & {
    state: RTCTransferState;
  })[];
  inTransfers: (RTCTrasnfer & {
    state: RTCTransferState;
  })[];
  startTransfer: (transferId: string) => void;
  deleteTransfer: (transferId: string) => void;
  pauseTransfer: (transferId: string) => void;
}) {
  return (
    <Modal placement="center" hideCloseButton {...rest}>
      <ModalContent>
        <Tabs classNames={{ tabList: "w-full" }}>
          <Tab
            key="out_transfers"
            title="Uploads"
            isDisabled={outTransfers.length === 0}
          >
            <div className="flex flex-col gap-2 p-1">
              {outTransfers.map((transfer) => (
                <TransferCard
                  transfer={transfer}
                  transferStart={() => startTransfer(transfer.id)}
                  transferDelete={() => deleteTransfer(transfer.id)}
                  transferPause={() => pauseTransfer(transfer.id)}
                  key={transfer.id}
                />
              ))}
            </div>
          </Tab>
          <Tab
            key="in_transfers"
            title="Downloads"
            isDisabled={inTransfers.length === 0}
          >
            <div className="flex flex-col gap-2 p-1">
              {inTransfers.map((transfer) => (
                <TransferCard
                  transfer={transfer}
                  transferStart={() => startTransfer(transfer.id)}
                  transferDelete={() => deleteTransfer(transfer.id)}
                  transferPause={() => pauseTransfer(transfer.id)}
                  key={transfer.id}
                />
              ))}
            </div>
          </Tab>
        </Tabs>
      </ModalContent>
    </Modal>
  );
}
