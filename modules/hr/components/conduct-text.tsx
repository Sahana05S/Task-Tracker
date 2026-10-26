import { conductBlocks } from '@/modules/hr/internal/rules';

/** The Code of Conduct's text on the letterhead: headings, bullet lists and paragraphs. */
export function ConductText({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h1 className="!mt-0 mb-4 text-center text-[15pt] font-bold tracking-wide uppercase">{title}</h1>
      {conductBlocks(body).map((block, index) =>
        block.kind === 'heading' ? <h2 key={index}>{block.text}</h2>
          : block.kind === 'list' ? <ul key={index}>{block.items.map((item, i) => <li key={i}>{item}</li>)}</ul>
            : <p key={index}>{block.text}</p>,
      )}
    </div>
  );
}
