// @vitest-environment jsdom
import { act, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { flowYaml, renderApp } from '../../testing/render-app'
import { YamlEditor } from './yaml-editor'

/**
 * jsdom has no layout, so these cover what the editor shows and marks.
 * Typing, scrolling and the lint gutter are covered by the Playwright tests.
 */
describe('YamlEditor', () => {
  const content = () => document.querySelector('.cm-content') as HTMLElement

  it('shows the YAML from the store', () => {
    renderApp(<YamlEditor />, { yaml: flowYaml('Tiny flow') })
    expect(screen.getByRole('textbox', { name: 'Flow YAML' })).toBeInTheDocument()
    expect(content()).toHaveTextContent('name: Tiny flow')
  })

  it('follows the store when the document is replaced', () => {
    const { store } = renderApp(<YamlEditor />, { yaml: flowYaml('Before') })
    act(() => store.getState().loadYaml(flowYaml('After')))
    expect(content()).toHaveTextContent('name: After')
  })

  it('counts YAML errors in its header', () => {
    const { store } = renderApp(<YamlEditor />, { yaml: flowYaml('Fine') })
    expect(screen.queryByText(/errors?$/)).not.toBeInTheDocument()

    act(() => store.getState().loadYaml('version: 1\nnodes:\n  - id: App\n    kind: nonsense\n'))
    expect(screen.getByText('1 error')).toBeInTheDocument()
  })

  it('highlights the line of the node selected on the canvas', () => {
    const { store } = renderApp(<YamlEditor />)
    expect(document.querySelector('.cm-lineage-node-line')).not.toBeInTheDocument()

    act(() => store.getState().select({ id: 'App' }))
    expect(document.querySelector('.cm-lineage-node-line')).toHaveTextContent('- id: App')

    act(() => store.getState().select(null))
    expect(document.querySelector('.cm-lineage-node-line')).not.toBeInTheDocument()
  })
})
