/** Names of the files Lineage reads and writes. */

function slug(text: string): string {
  const cleaned = text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return cleaned || 'untitled'
}

/** File name for a flow that has never been saved: "Orders dashboard" → orders-dashboard.flow.yaml */
export const flowFileName = (flowName: string) => `${slug(flowName)}.flow.yaml`

/** The layout file that sits next to a flow file: orders.flow.yaml → orders.flow.layout.json */
export function layoutFileName(flowFile: string | undefined, flowName: string): string {
  const base = flowFile ? flowFile.replace(/\.ya?ml$/i, '') : `${slug(flowName)}.flow`
  return `${base}.layout.json`
}

export const isLayoutFileName = (name: string) => /\.layout\.json$/i.test(name)
