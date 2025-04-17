import { createContext, useCallback, useContext } from "react";

export type FilesContextState = {
  addOwnedFile: (id: string, file: File) => void;
  getOwnedFile: (id: string) => File;
  deleteOwnedFile: (id: string) => void;
};

const FilesContext = createContext<FilesContextState>({
  addOwnedFile: () => {},
  getOwnedFile: (() => {}) as any,
  deleteOwnedFile: () => {},
});

const ownedFiles: { [id: string]: File } = {};

export default function FilesProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const addOwnedFile = useCallback((id: string, file: File) => {
    ownedFiles[id] = file;
  }, []);

  const getOwnedFile = useCallback((id: string) => {
    const file = ownedFiles[id];
    if (!file) throw new Error(`File of id ${id} does not exist.`);

    return file;
  }, []);

  const deleteOwnedFile = useCallback((id: string) => {
    delete ownedFiles[id];
  }, []);

  return (
    <FilesContext.Provider
      value={{ addOwnedFile, getOwnedFile, deleteOwnedFile }}
    >
      {children}
    </FilesContext.Provider>
  );
}

export function useFiles() {
  return useContext(FilesContext);
}
