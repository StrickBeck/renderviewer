// Capture the entries before the first await: browsers clear the drop data store
// as soon as the drop event handler yields.
export async function filesFromDrop(data: DataTransfer): Promise<File[]> {
  const walk = async (entry: FileSystemEntry, path = ""): Promise<File[]> => {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
      Object.defineProperty(file, "webkitRelativePath", { value: path + file.name, configurable: true });
      return [file];
    }
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    const children: FileSystemEntry[] = [];
    while (true) {
      const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
      if (!batch.length) break;
      children.push(...batch);
    }
    return (await Promise.all(children.map((child) => walk(child, path + entry.name + "/")))).flat();
  };
  const items = Array.from(data.items);
  const entries = items.map((item) => item.webkitGetAsEntry?.()).filter((item): item is FileSystemEntry => !!item);
  if (entries.length) return (await Promise.all(entries.map((entry) => walk(entry)))).flat();
  return Array.from(data.files);
}
