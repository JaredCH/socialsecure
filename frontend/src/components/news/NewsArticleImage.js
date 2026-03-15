import React, { useEffect, useState } from 'react';
import { getRenderableNewsImageUrl } from './utils';

export default function NewsArticleImage({ article, alt = '', wrapperClassName = '', imageClassName = '', loading = 'lazy' }) {
  const src = getRenderableNewsImageUrl(article);
  const [isBroken, setIsBroken] = useState(false);

  useEffect(() => {
    setIsBroken(false);
  }, [src]);

  if (!src || isBroken) return null;

  return (
    <div className={wrapperClassName}>
      <img
        src={src}
        alt={alt}
        loading={loading}
        className={imageClassName}
        onError={() => setIsBroken(true)}
      />
    </div>
  );
}