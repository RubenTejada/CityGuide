// "Reseñas" in the Content section: the newest reviews visitors left on the portal,
// hidden ones included, with the switch that takes one down or brings it back.
// Blocking an author is not done here — that is the member's "Approved" / "Locked
// out" in the Members section, and it takes every review they wrote off the portal.
//
// Plain ES module on the backoffice's own import map: no build step, nothing to
// bundle. It calls ReviewModerationController with the editor's session.

import { html, css, nothing } from "@umbraco-cms/backoffice/external/lit";
import { UmbLitElement } from "@umbraco-cms/backoffice/lit-element";
import { UMB_AUTH_CONTEXT } from "@umbraco-cms/backoffice/auth";

const PAGE = 50;
const API = "/umbraco/management/api/v1/cityguide/reviews";

export default class CityGuideReviewsDashboard extends UmbLitElement {
  static properties = {
    _items: { state: true },
    _total: { state: true },
    _skip: { state: true },
    _error: { state: true },
    _busy: { state: true },
  };

  #auth;

  constructor() {
    super();
    this._items = [];
    this._total = 0;
    this._skip = 0;
    this._error = "";
    this._busy = true;
    this.consumeContext(UMB_AUTH_CONTEXT, (auth) => {
      this.#auth = auth;
      this.#load();
    });
  }

  async #request(path, init = {}) {
    const config = this.#auth.getOpenApiConfiguration();
    const response = await fetch(`${config.base}${API}${path}`, {
      ...init,
      credentials: config.credentials,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${await config.token()}`,
        ...(init.headers ?? {}),
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  async #load() {
    this._busy = true;
    this._error = "";
    try {
      const page = await this.#request(`?skip=${this._skip}&take=${PAGE}`);
      this._items = page.items;
      this._total = page.total;
    } catch (error) {
      this._error = `No se pudieron leer las reseñas (${error.message}).`;
    } finally {
      this._busy = false;
    }
  }

  async #toggle(item) {
    try {
      await this.#request(`/${item.id}/hidden`, {
        method: "PUT",
        body: JSON.stringify({ hidden: !item.hidden }),
      });
      this._items = this._items.map((i) =>
        i.id === item.id ? { ...i, hidden: !item.hidden } : i,
      );
    } catch (error) {
      this._error = `No se pudo cambiar la reseña (${error.message}).`;
    }
  }

  #page(delta) {
    this._skip = Math.max(0, this._skip + delta * PAGE);
    this.#load();
  }

  render() {
    const last = Math.min(this._skip + PAGE, this._total);
    return html`
      <uui-box headline="Reseñas de visitantes">
        <p class="lead">
          Se publican al instante. "Ocultar" quita una del portal; para bloquear a
          quien la escribió, desmarca "Approved" en su ficha de la sección Members
          y se ocultan todas las suyas.
        </p>
        ${this._error ? html`<p class="error">${this._error}</p>` : nothing}
        ${this._busy
          ? html`<uui-loader></uui-loader>`
          : this._items.length === 0
            ? html`<p>Todavía no hay reseñas.</p>`
            : html`
                <uui-table>
                  <uui-table-head>
                    <uui-table-head-cell>Lugar</uui-table-head-cell>
                    <uui-table-head-cell>Autor</uui-table-head-cell>
                    <uui-table-head-cell>★</uui-table-head-cell>
                    <uui-table-head-cell>Comentario</uui-table-head-cell>
                    <uui-table-head-cell>Fecha</uui-table-head-cell>
                    <uui-table-head-cell></uui-table-head-cell>
                  </uui-table-head>
                  ${this._items.map((item) => this.#row(item))}
                </uui-table>
                <div class="pager">
                  <span>${this._skip + 1}–${last} de ${this._total}</span>
                  <uui-button
                    look="secondary"
                    ?disabled=${this._skip === 0}
                    @click=${() => this.#page(-1)}
                    label="Anteriores"
                  ></uui-button>
                  <uui-button
                    look="secondary"
                    ?disabled=${last >= this._total}
                    @click=${() => this.#page(1)}
                    label="Siguientes"
                  ></uui-button>
                </div>
              `}
      </uui-box>
    `;
  }

  #row(item) {
    return html`
      <uui-table-row class=${item.hidden || item.authorBlocked ? "off" : ""}>
        <uui-table-cell>
          <a href="section/content/workspace/document/edit/${item.placeKey}">${item.placeName}</a>
        </uui-table-cell>
        <uui-table-cell>
          <a href="section/member-management/workspace/member/edit/${item.memberKey}">${item.author}</a>
          <div class="muted">${item.authorEmail ?? ""}</div>
          ${item.authorBlocked ? html`<uui-tag color="danger">Bloqueado</uui-tag>` : nothing}
        </uui-table-cell>
        <uui-table-cell>${item.rating}</uui-table-cell>
        <uui-table-cell class="comment">${item.comment ?? ""}</uui-table-cell>
        <uui-table-cell>${new Date(item.updatedUtc).toLocaleString("es-DO")}</uui-table-cell>
        <uui-table-cell>
          <uui-button
            look=${item.hidden ? "primary" : "secondary"}
            color=${item.hidden ? "positive" : "danger"}
            label=${item.hidden ? "Mostrar" : "Ocultar"}
            @click=${() => this.#toggle(item)}
          ></uui-button>
        </uui-table-cell>
      </uui-table-row>
    `;
  }

  static styles = css`
    :host {
      display: block;
      padding: var(--uui-size-layout-1);
    }
    .lead {
      margin-top: 0;
      color: var(--uui-color-text-alt);
    }
    .error {
      color: var(--uui-color-danger);
    }
    .muted {
      color: var(--uui-color-text-alt);
      font-size: 0.85em;
    }
    .comment {
      white-space: pre-line;
      max-width: 40ch;
    }
    .off {
      opacity: 0.55;
    }
    .pager {
      display: flex;
      align-items: center;
      gap: var(--uui-size-space-3);
      margin-top: var(--uui-size-space-4);
    }
  `;
}

customElements.define("cityguide-reviews-dashboard", CityGuideReviewsDashboard);
