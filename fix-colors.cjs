const fs = require('fs');

function replace(file) {
  let content = fs.readFileSync(file, 'utf8');

  // Replace colors with theme
  content = content.replace(/color="yellow"/g, 'color={theme.text.highlight}');
  content = content.replace(/color="cyan"/g, 'color={theme.text.accent}');
  content = content.replace(/color="red"/g, 'color={theme.text.error}');
  content = content.replace(/color="white"/g, 'color={theme.text.normal}');
  content = content.replace(/color="green"/g, 'color={theme.text.success}');
  content = content.replace(/color="greenBright"/g, 'color={theme.text.successBright}');
  content = content.replace(/color="yellowBright"/g, 'color={theme.text.highlightBright}');
  content = content.replace(/color="cyanBright"/g, 'color={theme.text.accentBright}');

  // Replace borderColor
  content = content.replace(/borderColor="cyan"/g, 'borderColor={theme.border.active}');
  content = content.replace(/borderColor="red"/g, 'borderColor={theme.border.error}');
  content = content.replace(/borderColor="yellow"/g, 'borderColor={theme.border.hero}');
  content = content.replace(/borderColor="gray"/g, 'borderColor={theme.border.default}');
  content = content.replace(/borderColor="green"/g, 'borderColor={theme.border.focus}');

  // Replace backgroundColor
  content = content.replace(/backgroundColor="black"/g, 'backgroundColor={theme.bg.black}');
  
  // Specific border color logic
  content = content.replace(/borderColor=\{isFocused\('relation'\) \? "green" : "gray"\}/g, 'borderColor={isFocused(\'relation\') ? theme.border.focus : theme.border.default}');
  content = content.replace(/borderColor=\{isFocused\('episodes'\) \? "green" : "gray"\}/g, 'borderColor={isFocused(\'episodes\') ? theme.border.focus : theme.border.default}');
  content = content.replace(/borderColor=\{isFocused\('similar'\) \? "green" : "gray"\}/g, 'borderColor={isFocused(\'similar\') ? theme.border.focus : theme.border.default}');
  content = content.replace(/borderColor=\{isF \? "green" : "gray"\}/g, 'borderColor={isF ? theme.border.focus : theme.border.default}');
  content = content.replace(/borderColor="green"/g, 'borderColor={theme.border.focus}');

  fs.writeFileSync(file, content);
}

replace('src/screens/DetailScreen.tsx');
replace('src/screens/BrowseScreen.tsx');
replace('src/components/Sidebar.tsx');
