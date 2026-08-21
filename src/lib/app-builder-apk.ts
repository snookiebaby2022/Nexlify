import { cp, mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import { spawn } from "child_process";

export type AppBuildConfig = {
  buildId: string;
  appName: string;
  packageName: string;
  logoUrl?: string | null;
  splashUrl?: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  serverUrl?: string | null;
  config: Record<string, unknown>;
};

const TEMPLATE_DIR = join(process.cwd(), "templates", "android-branded");

export async function writeBrandedAppConfig(build: AppBuildConfig) {
  const outDir = join(process.cwd(), "public", "app-builds");
  await mkdir(outDir, { recursive: true });
  const configPath = join(outDir, `${build.buildId}.json`);
  const payload = {
    format: "nexlify-app-config/v2",
    generatedAt: new Date().toISOString(),
    ...build,
    note: "Branded Nexlify Android app configuration.",
  };
  await writeFile(configPath, JSON.stringify(payload, null, 2), "utf8");
  return { configPath, downloadUrl: `/app-builds/${build.buildId}.json` };
}

/** Copy Android Gradle template and inject branding; optionally run Gradle assembleDebug. */
export async function buildBrandedAndroidProject(build: AppBuildConfig): Promise<{
  projectZipUrl: string;
  apkUrl?: string;
  buildLog: string;
}> {
  const outRoot = join(process.cwd(), "public", "app-builds", build.buildId, "android");
  await mkdir(outRoot, { recursive: true });

  try {
    await cp(TEMPLATE_DIR, outRoot, { recursive: true });
  } catch {
    await scaffoldMinimalAndroidProject(outRoot, build);
  }

  await injectAndroidBranding(outRoot, build);

  const projectReadme = join(process.cwd(), "public", "app-builds", `${build.buildId}-android-README.txt`);
  await writeFile(
    projectReadme,
    [
      `Nexlify branded Android project — ${build.appName}`,
      `Package: ${build.packageName}`,
      `Build ID: ${build.buildId}`,
      "",
      "Run locally:",
      `  cd public/app-builds/${build.buildId}/android`,
      "  ./gradlew assembleDebug",
      "",
    ].join("\n"),
    "utf8"
  );

  let buildLog = "Template prepared.\n";
  let apkUrl: string | undefined;

  if (process.env.NEXLIFY_APK_BUILD === "1") {
    const result = await runGradleAssemble(outRoot);
    buildLog += result.log;
    if (result.apkPath) {
      const apkDest = join(process.cwd(), "public", "app-builds", `${build.buildId}.apk`);
      await cp(result.apkPath, apkDest);
      apkUrl = `/app-builds/${build.buildId}.apk`;
      buildLog += `APK written to ${apkUrl}\n`;
    }
  } else {
    buildLog +=
      "Set NEXLIFY_APK_BUILD=1 with Android SDK installed to compile APK on the server.\n";
    buildLog += "Project files are ready under public/app-builds/{id}/android\n";
  }

  return {
    projectZipUrl: `/app-builds/${build.buildId}-android-README.txt`,
    apkUrl,
    buildLog,
  };
}

async function scaffoldMinimalAndroidProject(outRoot: string, build: AppBuildConfig) {
  await mkdir(join(outRoot, "app", "src", "main", "assets"), { recursive: true });
  await writeFile(
    join(outRoot, "settings.gradle"),
    "rootProject.name = 'NexlifyBranded'\ninclude ':app'\n",
    "utf8"
  );
  await writeFile(
    join(outRoot, "build.gradle"),
    "plugins { id 'com.android.application' version '8.2.0' apply false }\n",
    "utf8"
  );
  await writeFile(
    join(outRoot, "app", "build.gradle"),
    [
      "plugins { id 'com.android.application' }",
      "android {",
      `  namespace '${build.packageName}'`,
      "  compileSdk 34",
      "  defaultConfig {",
      `    applicationId '${build.packageName}'`,
      "    minSdk 24",
      "    targetSdk 34",
      `    versionName '${String(build.config.versionName ?? "1.0.0")}'`,
      `    versionCode ${Number(build.config.versionCode ?? 1)}`,
      "  }",
      "}",
      "",
    ].join("\n"),
    "utf8"
  );
  await writeFile(
    join(outRoot, "app", "src", "main", "AndroidManifest.xml"),
    [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<manifest xmlns:android="http://schemas.android.com/apk/res/android">',
      "  <application android:label=\"" + build.appName.replace(/"/g, "") + "\" android:usesCleartextTraffic=\"true\">",
      "    <activity android:name=\".MainActivity\" android:exported=\"true\">",
      "      <intent-filter>",
      "        <action android:name=\"android.intent.action.MAIN\" />",
      "        <category android:name=\"android.intent.category.LAUNCHER\" />",
      "      </intent-filter>",
      "    </activity>",
      "  </application>",
      "</manifest>",
      "",
    ].join("\n"),
    "utf8"
  );
}

async function injectAndroidBranding(outRoot: string, build: AppBuildConfig) {
  const assetsDir = join(outRoot, "app", "src", "main", "assets");
  await mkdir(assetsDir, { recursive: true });
  await writeFile(
    join(assetsDir, "nexlify-config.json"),
    JSON.stringify(
      {
        appName: build.appName,
        packageName: build.packageName,
        serverUrl: build.serverUrl,
        colors: {
          primary: build.primaryColor,
          secondary: build.secondaryColor,
          accent: build.accentColor,
        },
        logoUrl: build.logoUrl,
        splashUrl: build.splashUrl,
        ...build.config,
      },
      null,
      2
    ),
    "utf8"
  );

  const stringsPath = join(outRoot, "app", "src", "main", "res", "values", "strings.xml");
  try {
    let xml = await readFile(stringsPath, "utf8");
    xml = xml.replace(/<string name="app_name">.*?<\/string>/, `<string name="app_name">${escapeXml(build.appName)}</string>`);
    await writeFile(stringsPath, xml, "utf8");
  } catch {
    await mkdir(join(outRoot, "app", "src", "main", "res", "values"), { recursive: true });
    await writeFile(
      join(outRoot, "app", "src", "main", "res", "values", "strings.xml"),
      `<?xml version="1.0" encoding="utf-8"?><resources><string name="app_name">${escapeXml(build.appName)}</string></resources>`,
      "utf8"
    );
  }
}

function escapeXml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function runGradleAssemble(cwd: string): Promise<{ log: string; apkPath?: string }> {
  return new Promise((resolve) => {
    const isWin = process.platform === "win32";
    const cmd = isWin ? "gradlew.bat" : "./gradlew";
    const child = spawn(cmd, ["assembleDebug"], { cwd, shell: isWin });
    let log = "";
    child.stdout?.on("data", (d) => {
      log += String(d);
    });
    child.stderr?.on("data", (d) => {
      log += String(d);
    });
    child.on("close", () => {
      const apkPath = join(cwd, "app", "build", "outputs", "apk", "debug", "app-debug.apk");
      resolve({ log, apkPath });
    });
    child.on("error", (err) => {
      resolve({ log: log + String(err) });
    });
  });
}

export function parseBrandedBuildInput(body: Record<string, unknown>) {
  return {
    appName: String(body.appName ?? "").trim(),
    packageName: String(body.packageName ?? "").trim(),
    logoUrl: body.logoUrl ? String(body.logoUrl) : null,
    splashUrl: body.splashUrl ? String(body.splashUrl) : null,
    primaryColor: body.primaryColor ? String(body.primaryColor) : "#00c0ef",
    secondaryColor: body.secondaryColor ? String(body.secondaryColor) : "#0f172a",
    accentColor: body.accentColor ? String(body.accentColor) : "#22c55e",
    serverUrl: body.serverUrl ? String(body.serverUrl) : null,
    config: typeof body.config === "object" && body.config ? (body.config as Record<string, unknown>) : {},
  };
}
