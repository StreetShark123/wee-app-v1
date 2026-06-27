import { Fragment } from "react";

// Renderiza texto convirtiendo URLs (http/https) en enlaces clicables.
const URL_SPLIT = /(https?:\/\/[^\s]+)/g;
const isUrl = (value: string): boolean => /^https?:\/\//.test(value);

export const Linkify = ({ text }: { text: string }) => {
  const parts = text.split(URL_SPLIT);
  return (
    <>
      {parts.map((part, index) =>
        isUrl(part) ? (
          <a key={index} href={part} target="_blank" rel="noopener noreferrer nofollow">
            {part.replace(/^https?:\/\/(www\.)?/, "")}
          </a>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        )
      )}
    </>
  );
};
