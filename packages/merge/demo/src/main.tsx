import { StrictMode, useEffect, useMemo, useState, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { TwoPaneDiffEditor, ThreePaneMergeEditor } from "@changeyard/merge/react";
import "@changeyard/merge/styles.css";
import "./styles.css";
import { fixtures } from "./fixtures";

type DemoMode = "three-way" | "two-pane";
type DemoTheme = "light" | "dark";
type DemoOptions = {
	ignoreWhitespace: boolean;
	ignoreCase: boolean;
	syncHorizontalScroll: boolean;
};

const selectableFixtures = fixtures;
const initialFixture = selectableFixtures.find((fixture) => fixture.id === "quicksort-c") ?? selectableFixtures[0] ?? fixtures[0]!;

function App(): ReactElement {
	const [fixtureId, setFixtureId] = useState(initialFixture.id);
	const [mode, setMode] = useState<DemoMode>("three-way");
	const [theme, setTheme] = useState<DemoTheme>("light");
	const [options, setOptions] = useState<DemoOptions>({ ignoreWhitespace: false, ignoreCase: false, syncHorizontalScroll: false });
	const fixture = useMemo(() => selectableFixtures.find((item) => item.id === fixtureId) ?? initialFixture, [fixtureId]);

	useEffect(() => {
		document.documentElement.dataset.theme = theme;
	}, [theme]);

	return (
		<div className="demo-shell">
			<header className="demo-toolbar">
				<div className="demo-title">
					<span>Merge Demo</span>
					<strong>{fixture.path}</strong>
				</div>
				<label className="demo-field">
					<span>Fixture</span>
					<select value={fixtureId} onChange={(event) => setFixtureId(event.target.value)}>
						{selectableFixtures.map((item) => (
							<option key={item.id} value={item.id}>
								{item.label}
							</option>
						))}
					</select>
				</label>
				<div className="demo-segment" aria-label="Mode">
					<button type="button" data-active={mode === "three-way"} onClick={() => setMode("three-way")}>
						3-way
					</button>
					<button type="button" data-active={mode === "two-pane"} onClick={() => setMode("two-pane")}>
						2-pane
					</button>
				</div>
				<div className="demo-segment" aria-label="Theme">
					<button type="button" data-active={theme === "light"} onClick={() => setTheme("light")}>
						Light
					</button>
					<button type="button" data-active={theme === "dark"} onClick={() => setTheme("dark")}>
						Dark
					</button>
				</div>
				<label className="demo-check">
					<input
						type="checkbox"
						checked={options.ignoreWhitespace}
						onChange={(event) => setOptions((current) => ({ ...current, ignoreWhitespace: event.target.checked }))}
					/>
					<span>Ignore whitespace</span>
				</label>
				<label className="demo-check">
					<input
						type="checkbox"
						checked={options.ignoreCase}
						onChange={(event) => setOptions((current) => ({ ...current, ignoreCase: event.target.checked }))}
					/>
					<span>Ignore case</span>
				</label>
				<label className="demo-check">
					<input
						type="checkbox"
						checked={options.syncHorizontalScroll}
						onChange={(event) => setOptions((current) => ({ ...current, syncHorizontalScroll: event.target.checked }))}
					/>
					<span>Sync horizontal scroll</span>
				</label>
			</header>

			<main className="demo-main">
				<section className="demo-editor-panel" aria-label="Merge editor">
					{mode === "three-way" ? (
						<ThreePaneMergeEditor
							key={`${fixture.id}:three-way:${options.ignoreWhitespace}:${options.ignoreCase}`}
							left={fixture.left}
							base={fixture.base}
							right={fixture.right}
							leftLabel={fixture.leftLabel}
							baseLabel={fixture.baseLabel}
							rightLabel={fixture.rightLabel}
							path={fixture.path}
							language={fixture.language}
							ignoreWhitespace={options.ignoreWhitespace}
							ignoreCase={options.ignoreCase}
							editableSides={["left", "base", "right"]}
							syncHorizontalScroll={options.syncHorizontalScroll}
						/>
					) : (
						<TwoPaneDiffEditor
							key={`${fixture.id}:two-pane:${options.ignoreWhitespace}:${options.ignoreCase}`}
							left={fixture.left}
							right={fixture.right}
							leftLabel={fixture.leftLabel}
							rightLabel={fixture.rightLabel}
							path={fixture.path}
							language={fixture.language}
							ignoreWhitespace={options.ignoreWhitespace}
							ignoreCase={options.ignoreCase}
							syncHorizontalScroll={options.syncHorizontalScroll}
						/>
					)}
				</section>
			</main>
		</div>
	);
}

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
