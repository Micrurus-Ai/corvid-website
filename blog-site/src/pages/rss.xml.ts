/**
 * RSS 2.0 feed for the Corvid blog at /blog/rss.xml.
 *
 * Sourced from the same `blog` content collection that powers the index
 * page and per-post routes, with the same draft filter and reverse-date
 * sort. `@astrojs/rss` prepends `context.site` to relative `link` values
 * so each item resolves to https://corvid-lang.org/blog/<slug>.
 *
 * Spec target: RSS 2.0 with one `<atom:link rel="self">` for self-
 * description (added via the xmlns + xml stylesheet options below). The
 * output validates clean against https://validator.w3.org/feed/.
 */
import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';

export async function GET(context: APIContext) {
  const posts = (await getCollection('blog'))
    .filter((p) => !p.data.draft)
    .sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());

  const site = context.site ?? new URL('https://corvid-lang.org');

  return rss({
    title: 'Corvid Blog',
    description:
      'Posts from the Corvid team — a programming language where dangerous AI actions either compile with a proof or do not compile at all.',
    site,
    xmlns: { atom: 'http://www.w3.org/2005/Atom' },
    customData: `<language>en-us</language><atom:link href="${new URL('blog/rss.xml', site).toString()}" rel="self" type="application/rss+xml" />`,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.pubDate,
      author: post.data.author,
      link: `/blog/${post.id}`,
    })),
  });
}
