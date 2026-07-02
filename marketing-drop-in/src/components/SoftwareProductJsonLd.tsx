import {
  buildProductSchema,
  buildSoftwareApplicationSchema,
  type SchemaOffer,
} from "@/lib/software-schema";

type SoftwareProductJsonLdProps = {
  path: string;
  name?: string;
  description?: string;
  offers?: SchemaOffer[];
  /** Include Product schema alongside SoftwareApplication (pricing/product pages). */
  includeProduct?: boolean;
};

export function SoftwareProductJsonLd({
  path,
  name,
  description,
  offers,
  includeProduct = false,
}: SoftwareProductJsonLdProps) {
  const baseUrl = path.startsWith("http") ? path : `https://nexlify.live${path === "/" ? "" : path}`;

  const software = buildSoftwareApplicationSchema({
    name,
    description,
    url: baseUrl,
    offers,
  });

  const schemas: object[] = [software];

  if (includeProduct) {
    schemas.push(
      buildProductSchema({
        name,
        description,
        url: baseUrl,
        offers,
      }),
    );
  }

  return (
    <>
      {schemas.map((schema, index) => (
        <script
          key={index}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}
    </>
  );
}
