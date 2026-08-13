// Slika dokumenta: izbor (kamera/galerija) -> kompresija -> trajno snimanje u document dir.
// Kompresuje se PRE reda/uploada (ušteda mreže). Snima u documentDirectory (NE cache) da
// fajl preživi do sinhronizacije. Vraća lokalni uri ili null (korisnik odustao / nema dozvole).
import * as ImagePicker from "expo-image-picker";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import * as FileSystem from "expo-file-system/legacy";
import { uuidv4 } from "./uuid";

export type ImageSource = "camera" | "library";

const MAX_EDGE = 1600; // duža strana ~1600px
const QUALITY = 0.7;   // JPEG kvalitet

// Folder za priloge u trajnom skladištu aplikacije.
const dirUri = () => `${FileSystem.documentDirectory}attachments/`;

async function ensureDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(dirUri());
  if (!info.exists) await FileSystem.makeDirectoryAsync(dirUri(), { intermediates: true });
}

export async function pickAndCompress(source: ImageSource): Promise<string | null> {
  // Dozvole
  if (source === "camera") {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return null;
  } else {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return null;
  }

  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 1 };
  const result = source === "camera"
    ? await ImagePicker.launchCameraAsync(opts)
    : await ImagePicker.launchImageLibraryAsync(opts);
  if (result.canceled || !result.assets?.[0]) return null;

  // Kompresija: skaliraj dužu stranu na ~1600px, JPEG ~0.7
  const asset = result.assets[0];
  const longer = Math.max(asset.width ?? 0, asset.height ?? 0);
  const actions =
    longer > MAX_EDGE
      ? [{ resize: (asset.width ?? 0) >= (asset.height ?? 0) ? { width: MAX_EDGE } : { height: MAX_EDGE } }]
      : [];
  const out = await manipulateAsync(asset.uri, actions, { compress: QUALITY, format: SaveFormat.JPEG });

  // Premesti u trajni folder (manipulateAsync piše u cache).
  await ensureDir();
  const dest = `${dirUri()}${uuidv4()}.jpg`;
  await FileSystem.moveAsync({ from: out.uri, to: dest });
  return dest;
}
