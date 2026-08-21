import { mkdir, writeFile } from "fs/promises";
import { join } from "path";

const root = join(process.cwd(), "templates", "android-branded");

async function main() {
  await mkdir(join(root, "app", "src", "main", "res", "values"), { recursive: true });
  await mkdir(join(root, "app", "src", "main", "assets"), { recursive: true });

  await writeFile(
    join(root, "settings.gradle"),
    "rootProject.name = 'NexlifyBranded'\ninclude ':app'\n",
    "utf8"
  );
  await writeFile(
    join(root, "build.gradle"),
    "plugins { id 'com.android.application' version '8.2.0' apply false }\n",
    "utf8"
  );
  await writeFile(
    join(root, "app", "build.gradle"),
    [
      "plugins { id 'com.android.application' }",
      "android {",
      "  namespace 'com.nexlify.template'",
      "  compileSdk 34",
      "  defaultConfig {",
      "    applicationId 'com.nexlify.template'",
      "    minSdk 24",
      "    targetSdk 34",
      "    versionCode 1",
      "    versionName '1.0.0'",
      "  }",
      "}",
      "",
    ].join("\n"),
    "utf8"
  );
  await writeFile(
    join(root, "app", "src", "main", "AndroidManifest.xml"),
    [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<manifest xmlns:android="http://schemas.android.com/apk/res/android">',
      '  <application android:label="@string/app_name" android:usesCleartextTraffic="true">',
      '    <activity android:name=".MainActivity" android:exported="true">',
      "      <intent-filter>",
      '        <action android:name="android.intent.action.MAIN" />',
      '        <category android:name="android.intent.category.LAUNCHER" />',
      "      </intent-filter>",
      "    </activity>",
      "  </application>",
      "</manifest>",
      "",
    ].join("\n"),
    "utf8"
  );
  await writeFile(
    join(root, "app", "src", "main", "res", "values", "strings.xml"),
    '<?xml version="1.0" encoding="utf-8"?><resources><string name="app_name">Nexlify IPTV</string></resources>',
    "utf8"
  );
  await writeFile(
    join(root, "app", "src", "main", "assets", "nexlify-config.json"),
    "{}",
    "utf8"
  );
  console.log("Android branded template ready:", root);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
