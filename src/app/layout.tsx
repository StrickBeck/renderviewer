import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VisualShower — пространство для 3D",
  description: "Простой просмотр 3D-моделей в браузере. Орбита, свободный полёт и локальная загрузка файлов.",
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru"><body>{children}</body></html>;
}
