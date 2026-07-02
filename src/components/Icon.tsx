import type { CSSProperties } from "react";
import {
  ArrowLeft,
  Bell,
  BookOpen,
  Camera,
  CaretDown,
  CaretUp,
  ChatCircleText,
  Check,
  Copy,
  Diamond,
  DiceFive,
  DownloadSimple,
  Eye,
  EyeSlash,
  Flame,
  GearSix,
  Heart,
  House,
  Leaf,
  Lightning,
  LinkSimple,
  ListDashes,
  MagnifyingGlass,
  MoonStars,
  Newspaper,
  PaperPlaneTilt,
  PencilSimple,
  Pepper,
  Plus,
  ShieldCheck,
  SignOut,
  Sparkle,
  Spiral,
  Star,
  Tag,
  Target,
  ThumbsDown,
  ThumbsUp,
  Trash,
  Trophy,
  UploadSimple,
  User,
  UsersThree,
  X,
  type Icon as PhosphorIcon
} from "@phosphor-icons/react";

// Iconografía de la app: Phosphor en peso "duotone" — dos capas de tinta
// (trazo + aguada al 20%), como una ilustración impresa a dos tintas. Sustituye
// al set casero de paths sólidos. La API (name/size/className/style) se
// mantiene: los call sites no cambian.

export type IconName =
  | "home"
  | "user"
  | "link"
  | "comment"
  | "logout"
  | "camera"
  | "trash"
  | "upload"
  | "download"
  | "timeline"
  | "tag"
  | "arrowLeft"
  | "arrowUp"
  | "arrowDown"
  | "search"
  | "plus"
  | "bolt"
  | "users"
  | "check"
  | "flame"
  | "chili"
  | "news"
  | "book"
  | "settings"
  | "trophy"
  | "dice"
  | "heart"
  | "spark"
  | "spiral"
  | "star"
  | "moon"
  | "leaf"
  | "diamond"
  | "target"
  | "eye"
  | "eyeOff"
  | "shield"
  | "bell"
  | "send"
  | "thumbUp"
  | "thumbDown"
  | "pencil"
  | "x"
  | "copy";

const GLYPHS: Record<IconName, PhosphorIcon> = {
  home: House,
  user: User,
  link: LinkSimple,
  comment: ChatCircleText,
  logout: SignOut,
  camera: Camera,
  trash: Trash,
  upload: UploadSimple,
  download: DownloadSimple,
  timeline: ListDashes,
  tag: Tag,
  arrowLeft: ArrowLeft,
  arrowUp: CaretUp,
  arrowDown: CaretDown,
  search: MagnifyingGlass,
  plus: Plus,
  bolt: Lightning,
  users: UsersThree,
  check: Check,
  flame: Flame,
  chili: Pepper,
  news: Newspaper,
  book: BookOpen,
  settings: GearSix,
  trophy: Trophy,
  dice: DiceFive,
  heart: Heart,
  spark: Sparkle,
  spiral: Spiral,
  star: Star,
  moon: MoonStars,
  leaf: Leaf,
  diamond: Diamond,
  target: Target,
  eye: Eye,
  eyeOff: EyeSlash,
  shield: ShieldCheck,
  bell: Bell,
  send: PaperPlaneTilt,
  thumbUp: ThumbsUp,
  thumbDown: ThumbsDown,
  pencil: PencilSimple,
  x: X,
  copy: Copy
};

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  style?: CSSProperties;
}

export const Icon = ({ name, size = 16, className, style }: IconProps) => {
  const Glyph = GLYPHS[name];
  return <Glyph size={size} weight="duotone" className={className} style={style} aria-hidden="true" />;
};
