namespace tileworld {

    enum RuleEditorMenus { RuleTypeMenu, AttrTypeMenu, CommandMenu, None };
    enum CommandTokens { MoveArrow, PaintBrush, PaintTile, SpaceTile, Delete };

    const yoff = 6;

    // TODO: get rid of sprites for commands
    // TODO: consistency of A pressed for menus, etc.
    // TODO: opportunities for some abstraction
    //  - need to pull out code for displaying diamond.
    export class RuleEditor {
        private background: Image;
        private cursor: Sprite;

        // in-world menus
        private menu: RuleEditorMenus;  // which menu is active?
        private tileSaved: Sprite;      // remember the tile that we are editing
        private showSprites: Sprite[] = [];  // all sprites created
        // rule type state
        private ruleTypeMap: Image;     // mapping of tile to rule type
        private dirMap: Image;          // mapping of tile to direction
        // whendo state
        private attrSelected: number;
        // for editing commands
        private otherCursor: Sprite;      // show correspondence between left and right
        private commandSprites: Sprite[]; // the commands created so far
        private commandMenuSprites: Sprite[];
        private whenDo: number;           // which WhenDo is being edited
        private currentCommand: Command;  // the current command (potentially null)
        private tokens: CommandTokens[];

        constructor(private manager: ImageManager, private rule: number) {
            this.ruleTypeMap = image.create(10,7);
            this.dirMap = image.create(10,7);
            
            // attribute menu view
            this.attrSelected = -1;
            this.tileSaved = sprites.create(cursorOut)
            this.tileSaved.setFlag(SpriteFlag.Invisible, true)
            this.tileSaved.z = 10;
            this.background = image.create(160, 120)
            scene.setBackgroundImage(this.background)           

            // Control
            this.menu = RuleEditorMenus.None;
            this.cursor = sprites.create(cursorIn)
            this.cursor.setFlag(SpriteFlag.Invisible, false)
            this.cursor.x = 40
            this.cursor.y = yoff+40
            this.cursor.z = 50;
            // linked cursor
            this.otherCursor = sprites.create(cursorOut)
            this.otherCursor.setFlag(SpriteFlag.Invisible, true)
            this.otherCursor.x = 88
            this.otherCursor.y = yoff+40
            this.otherCursor.z = 50;

            // refresh display
            this.update();

            controller.left.onEvent(ControllerButtonEvent.Pressed, () => {
                if (this.col() > 0)
                    this.cursor.x -= 16
                this.cursorMove();
            })
            controller.right.onEvent(ControllerButtonEvent.Pressed, () => {
                if (this.col() < 9)
                    this.cursor.x += 16
                this.cursorMove();
            })
            controller.up.onEvent(ControllerButtonEvent.Pressed, () => {
                if (this.row() > 0)
                    this.cursor.y -= 16;
                this.cursorMove();
            })
            controller.down.onEvent(ControllerButtonEvent.Pressed, () => {
                if (this.row() < 6)
                    this.cursor.y += 16;
                this.cursorMove();
            })
            controller.A.onEvent(ControllerButtonEvent.Pressed, () => {
                if (this.manhattanDistance2() == 0) {
                     // if we are on center sprite, bring up the ruletype menu
                    if (this.menu == RuleEditorMenus.RuleTypeMenu) {
                        this.noMenu();
                    } else {
                        this.noMenu();
                        this.menu = RuleEditorMenus.RuleTypeMenu;
                        this.setTileSaved();
                    }
                } else if (this.manhattanDistance2() <=2) {
                     // otherwise if we are in the diamond, bring up attr menu
                    if (this.menu == RuleEditorMenus.AttrTypeMenu) {
                        this.noMenu();
                    } else {
                        this.menu = RuleEditorMenus.AttrTypeMenu;
                        this.setTileSaved()
                    }
                } else if (this.cursor.x >= 96 && (this.cursor.y -yoff) < 80) {
                    let yes = this.tryEditCommand();
                    if (!yes) this.noMenu();
                } else if (this.menu == RuleEditorMenus.RuleTypeMenu) {
                    this.noMenu();
                } else if (this.menu == RuleEditorMenus.AttrTypeMenu) {
                    let yes = this.attrUpdate();
                    if (!yes) this.noMenu();
                } else if (this.menu == RuleEditorMenus.CommandMenu) {
                    // look for deletion
                    this.exitCommandMenu();
                }
                this.update();
            })
            controller.B.onEvent(ControllerButtonEvent.Pressed, () => {
                
            })
        }

        private col(curr: boolean = true) { 
            return curr ? this.cursor.x >> 4 : this.tileSaved.x >> 4; 
        }
        private row(curr: boolean = true) { 
            return curr ? (this.cursor.y - yoff) >> 4: (this.tileSaved.y - yoff) >> 4; 
        }

        private cursorMove() {
            if (this.menu == RuleEditorMenus.None) {
                this.otherCursorMove();
            } else {
                if (this.menu == RuleEditorMenus.RuleTypeMenu) {
                    let rt = this.ruleTypeMap.getPixel(this.col(), this.row());
                    if (rt != 0xf) {
                        setType(this.rule,rt);
                        setDir(this.rule,this.dirMap.getPixel(this.col(), this.row()));
                        this.update();
                    }
                } else if (this.menu == RuleEditorMenus.CommandMenu) {
                    this.commandUpdate();
                    this.update();
                }
            }
        }

        private otherCursorMove() {
            let col = this.col();
            let row = this.row();
            if (this.manhattanDistance2() <= 1) {
                this.otherCursor.setFlag(SpriteFlag.Invisible, false);
                // compute mapping from left to right hand side
                this.otherCursor.x = 88;
                if (col == 1) this.otherCursor.y = yoff+24;
                else if (col == 3) this.otherCursor.y = yoff+56;
                else if (row == 1) this.otherCursor.y = yoff+8;
                else if (row == 3) this.otherCursor.y = yoff+72;
                else this.otherCursor.y = yoff+40;
            } else if (this.cursor.x >= 80 && (this.cursor.y - yoff) < 80) {
                this.otherCursor.setFlag(SpriteFlag.Invisible, false);
                // compute mapping from right to left hand side
                if (row == 0 || row == 2 || row == 4)
                    this.otherCursor.x = 40;
                else
                    this.otherCursor.x = (row == 1) ? 24 : 56;
                if (1 <= row && row <= 3)
                    this.otherCursor.y = yoff+40;
                else
                    this.otherCursor.y = yoff + ((row == 0) ? 24 : 56);
            } else {
                this.otherCursor.setFlag(SpriteFlag.Invisible, true);
            }
        }

        private setTileSaved() {
            this.tileSaved.x = this.cursor.x;
            this.tileSaved.y = this.cursor.y;
            this.tileSaved.z = 100;
            this.tileSaved.setFlag(SpriteFlag.Invisible, false);
        }

        private noMenu() {
            this.whenDo = null;
            this.currentCommand = null;
            this.attrSelected = -1;
            this.menu = RuleEditorMenus.None;
            this.tileSaved.setFlag(SpriteFlag.Invisible, true);
        }
        
        private manhattanDistance2() {
            return (Math.abs(2 - this.col()) + Math.abs(2 - this.row()));
        }

        private update() {
            this.showSprites.forEach(spr => { spr.destroy(); })
            this.showSprites = [];

            this.background.fill(11);
            this.background.fillRect(0, 0, 80, 120, 12);
            this.background.print("When", 0, 0);
            this.background.print("Do", 80, 0);

            this.makeContext();
            this.showCommands(); 

            if (this.menu == RuleEditorMenus.RuleTypeMenu) {
                this.ruleTypeMap.fill(0xf);
                this.dirMap.fill(0xf);
                this.showRuleMenu(0, 5);
            } else if (this.menu == RuleEditorMenus.AttrTypeMenu) {
                this.dirMap.fill(0xf);
                this.attrMenu()
            } else if (this.menu == RuleEditorMenus.CommandMenu) {
                this.modifyCommandMenu();
                this.commandUpdate();
            }
            this.showRuleType(getType(this.rule), getDir(this.rule), 2, 2, false);

        }

        private centerImage() {
            return this.manager.getImage(getKinds(this.rule)[0]);
        }

        private showRuleMenu(x: number, y: number) {
            this.showRuleType(RuleType.Resting, 0, x, y-1);
            this.showRuleType(RuleType.Moving, MoveDirection.Left, x, y);
            this.showRuleType(RuleType.Moving, MoveDirection.Right, x + 1, y);
            this.showRuleType(RuleType.Moving, MoveDirection.Up, x, y + 1);
            this.showRuleType(RuleType.Moving, MoveDirection.Down, x + 1, y + 1);
            this.showRuleType(RuleType.Pushing, MoveDirection.Right, x + 3, y);
            this.showRuleType(RuleType.Pushing, MoveDirection.Left, x + 2, y+1);
            this.showRuleType(RuleType.Pushing, MoveDirection.Down, x + 4, y+1);
            this.showRuleType(RuleType.Pushing, MoveDirection.Up, x + 5, y);
            this.showRuleType(RuleType.Colliding, MoveDirection.Right, x + 6, y);
            this.showRuleType(RuleType.Colliding, MoveDirection.Left, x + 7, y + 1);
            this.showRuleType(RuleType.Colliding, MoveDirection.Down, x + 9, y);
            this.showRuleType(RuleType.Colliding, MoveDirection.Up, x + 8, y+1);
        }

        private showRuleType(rt: RuleType, rd: MoveDirection, x: number, y: number, 
                showSelected: boolean = true) {
            let selected = showSelected && rt == getType(this.rule) && 
                    (rt == RuleType.Resting || rd == getDir(this.rule));
            let selCol = 13
            if (selected) {
                this.background.fillRect(x << 4, (y << 4) + yoff, 16, 16, selCol)
            }
            this.drawImage(x, y, this.centerImage());
            this.ruleTypeMap.setPixel(x, y, rt);
            this.dirMap.setPixel(x, y, rd);
            if (rt == RuleType.Moving || rt == RuleType.Colliding) {
                let indexOf = arrowValues.indexOf(rd);
                this.drawImage(x, y, arrowImages[indexOf])
            }
            if (rt == RuleType.Pushing || rt == RuleType.Colliding) {
                let indexOf = arrowValues.indexOf(rd);
                let ax = rd == MoveDirection.Left ? 1 : (rd == MoveDirection.Right ? -1 : 0)
                let ay = rd == MoveDirection.Down ? -1 : (rd == MoveDirection.Up ? 1 : 0)
                if (rt == RuleType.Pushing) {
                    if (selected) {
                        this.background.fillRect((x + ax) << 4, ((y + ay) << 4) + yoff, 
                            16, 16, selCol)
                    }
                    this.drawImage(x+ax, y+ay, arrowImages[indexOf])
                    this.ruleTypeMap.setPixel(x+ax, y+ay, rt);
                    this.dirMap.setPixel(x+ax, y+ay, rd);
                } else {
                    if (selected) {
                        this.background.fillRect((x - ax) << 4, ((y - ay) << 4) + yoff,
                            16, 16, selCol)
                    }
                    this.showCollisionSprite(x - ax, y - ay, rd);
                    this.ruleTypeMap.setPixel(x - ax, y - ay , rt);
                    this.dirMap.setPixel(x - ax, y - ay, rd);
                }
            }
        }

        private showCollisionSprite(col:number, row:number, dir: MoveDirection) {
            let spr = this.showSprite(col, row, smallSprite)
            spr.x += (dir == MoveDirection.Left) ? 4 : (dir == MoveDirection.Right) ? -4 : 0;
            spr.y += (dir == MoveDirection.Up) ? 4 : (dir == MoveDirection.Down) ? -4 : 0; 
        }

        private drawImage(c: number, r: number, img: Image, z: number = 0) {
            this.background.drawTransparentImage(img, c << 4, yoff + (r << 4));
        }

        private showSprite(c: number, r: number, img: Image, z: number = 0) {
            let spr = sprites.create(img);
            spr.z = z;
            spr.x = (c << 4) + 8;
            spr.y = yoff + (r << 4) + 8;
            this.showSprites.push(spr);
            return spr;
        }

        private drawOutline(c: number, r: number) {
            this.background.drawRect(c << 4,yoff + (r << 4),17,17,12)
        }

        private makeContext() {
            let spaceImg = this.manager.empty();
            for (let i = 0; i <= 4; i++) {
                for (let j = 0; j <= 4; j++) {
                    let dist = Math.abs(2-j) + Math.abs(2-i);
                    if (dist <= 2) {
                        this.drawImage(i,j, spaceImg);
                        if (i!=0 || j!=0)
                            this.showAttributes(i,j);
                        if (dist <= 1)
                            this.findWitness(i,j);
                    }
                }
            }
        }

        // - jump cursor to selected on start of menu ???
        private rowToCoord = [ 
            { lr: 0, col: 2, row: 1}, 
            { lr: 1, col: 1, row: 2 },
            { lr: 2, col: 2, row: 2 }, 
            { lr: 3, col: 3, row: 2 },
            { lr: 4, col: 2, row: 3 } ];
        
        private showCommands() {
            this.commandSprites = [];
            this.rowToCoord.forEach(r => {
                this.showCommandsAt(r.lr, this.getWhenDo(r.col, r.row));
            })
        }

        private showCommandsAt(row: number, whendo: number) {
            let spaceImg = this.manager.empty();
            let img2 = getWitness(this.rule, whendo) == -1 ? genericSprite : 
                this.manager.getImage(getWitness(this.rule, whendo));
            this.drawImage(5, row, img2);
            // show the existing commands
            let col = 6;
            let tokens = this.getTokens(whendo);
            for(let cid = 0; cid < 4; cid++) {
                let c = getCommand(this.rule,whendo,cid);
                if (c.inst != -1) {
                    this.showCommand(col, row, c, tokens);
                } else {
                    if (tokens.length > 0) {
                        let command = this.commandSprites[this.commandSprites.length - 1];
                        if (command.kind() != CommandTokens.SpaceTile)
                            this.showCommand(col, row, c, tokens);
                    }
                    break;
                }
            }
        }

        private showCommand(col: number, row: number, c: Command, tokens: CommandTokens[]) {
            let worker = (spr: Sprite, tok: CommandTokens) => {
                spr.setKind(tok);
                spr.data = c;
                this.commandSprites.push(spr);
                tokens.removeElement(tok);
                col = col + 1;
            };
            if (c.inst == -1) {
                let spaceImg = this.manager.empty();
                let spr = this.showSprite(col, row, spaceImg);       
                spr.setKind(CommandTokens.SpaceTile);
                spr.data = { c: c, t: tokens };
                this.commandSprites.push(spr);
            } else if (c.inst == CommandType.Move) {
                let spr = this.showSprite(col, row, arrowImages[arrowValues.indexOf(c.arg)]);
                worker(spr, CommandTokens.MoveArrow);
            } else if (c.inst == CommandType.Paint) {
                let spr = this.showSprite(col, row, this.manager.fixed()[c.arg]);
                worker(spr, CommandTokens.PaintTile);
            }
            return col;
        }

        private getTokens(whendo: number) {
            let tokens = [CommandTokens.PaintTile];
            if (getWitness(this.rule, whendo) != -1)
                tokens.insertAt(0, CommandTokens.MoveArrow);
            return tokens;
        }

        private tryEditCommand() {
            let commandSprite = 
                this.commandSprites.find(c => (c.y == this.cursor.y && c.x == this.cursor.x));
            // nothing to do here
            if (commandSprite == null)
                return false;
            // set up the state
            this.menu = RuleEditorMenus.CommandMenu;
            let r = this.rowToCoord.find(r => r.lr == this.row());
            this.whenDo = this.getWhenDo(r.col, r.row);
            this.setTileSaved();
            if (commandSprite.kind() == CommandTokens.SpaceTile) {
                // editing the tail command
                this.currentCommand = commandSprite.data.c;
                this.tokens = commandSprite.data.t;
                this.makeCommandMenu();
            } else {
                this.currentCommand = commandSprite.data;
                this.tokens = [];
                this.modifyCommandMenu();
            }
            return true;
        }

        private makeCommandMenu() {
            this.commandMenuSprites = [];
            let col = 5;
            let row = 5;
            let worker = (img: Image, tok: CommandTokens) => {
                this.drawOutline(col, row);
                let spr = this.showSprite(col, row, img);
                spr.setKind(tok);
                this.commandMenuSprites.push(spr);
                col++;
            };
            // show the commands
            let brush = false;
            this.tokens.forEach(ct => {
                if (ct == CommandTokens.MoveArrow && getWitness(this.rule,this.whenDo) != -1) {
                    arrowValues.forEach(v => {
                        worker(arrowImages[arrowValues.indexOf(v)], ct);
                    })
                } else if (ct == CommandTokens.PaintBrush) {
                    //worker(paintSprite.image, ct);
                    //brush = true;
                } else if (!brush && ct == CommandTokens.PaintTile) {
                    col = 5; row = 6;
                    this.manager.fixed().forEach(image => {
                        worker(image, CommandTokens.PaintTile);
                    })
                } else if (ct == CommandTokens.Delete) {
                    worker(deleteIcon, ct);
                }
            });
        }

        private modifyCommandMenu() {
            if (this.menu != RuleEditorMenus.CommandMenu)
                return;
            if (this.tokens.length > 0) {
                this.makeCommandMenu();
            } else if (this.currentCommand.inst == CommandType.Move) {
                this.tokens = [CommandTokens.MoveArrow, CommandTokens.Delete];
                this.makeCommandMenu();
            } else if (this.currentCommand.inst == CommandType.Paint) { 
                this.tokens = [CommandTokens.PaintTile, CommandTokens.Delete];
                this.makeCommandMenu();
            } else {
                this.noMenu();
            }
        }

        private exitCommandMenu() {
            this.commandUpdate(true);
            this.noMenu();
        }

        private commandUpdate(exit: boolean = false) {
            if (this.menu != RuleEditorMenus.CommandMenu)
                return;
            this.commandMenuSprites.forEach(s => {
                if (this.cursor.overlapsWith(s)) {
                    if (s.kind() == CommandTokens.MoveArrow) {
                        this.currentCommand.inst = CommandType.Move;
                        this.currentCommand.arg = arrowValues[arrowImages.indexOf(s.image)];
                    } else if (s.kind() == CommandTokens.PaintBrush) {
                        this.currentCommand.inst = CommandType.Paint;
                        this.currentCommand.arg = -1;
                    } else if (s.kind() == CommandTokens.PaintTile) {
                        //let paint = this.whenDo.commands.find(c => c.inst == CommandType.Paint);
                        this.currentCommand.inst = CommandType.Paint;
                        this.currentCommand.arg = this.manager.getKind(s.image); // TODO 
                    } else if (s.kind() == CommandTokens.Delete && exit) {
                        // TODO: index of the command
                        // this.whenDo.commands.removeElement(this.currentCommand);
                    }
                }
            })
        }

        private posSpritePosition(whendo: number, begin: number) {
            let index = this.attrIndex(whendo, AttrType.Include, begin);
            return (index == -1) ? this.attrIndex(whendo, AttrType.OneOf,begin) : index;
        }

        // what is ordering of sprites?
        // (0,0) always first
        private findWitness(col: number, row: number) {
            let whendo = this.getWhenDo(col, row)
            if (col != 2 || row != 2) {
                let witness = this.posSpritePosition(whendo, this.manager.fixed().length);
                setWitness(this.rule, whendo, witness);
            }
        }

        private attrIndex(whendo: number, a: AttrType, begin: number = 0) {
            for(let i = begin; i<this.manager.all().length; i++) {
                if (getAttr(this.rule, whendo, i) == a) 
                    return i;
            }
            return -1;
        }

        private showAttributes(col: number, row: number) {
            let whendo = getWhenDo(this.rule, col, row);
            if (whendo >= 0) {
                // if there is an include or single oneOf, show it.
                let index = this.attrIndex(whendo, AttrType.Include);
                if (index == -1) {
                    index = this.attrIndex(whendo, AttrType.OneOf);
                    if (index != -1) {
                        let index2 = this.attrIndex(whendo, AttrType.OneOf,index+1);
                        if (index2 != -1)
                            index = -1;
                    }
                }
                // and skip to the other (if it exists)
                let begin = 0;
                let end = this.manager.all().length-1;
                if (index != -1) {
                    this.drawImage(col, row, this.manager.getImage(index));
                    if (index < this.manager.fixed().length) {
                        begin = this.manager.fixed().length;
                    } else {
                        end = this.manager.fixed().length-1;
                    }
                }
                let project = this.projectAttrs(this.rule, this.whenDo, begin, end);
                let done: AttrType[] = [];
                project.forEach(index => {
                    let val = getAttr(this.rule, this.whenDo, index);
                    // eliminate duplicates
                    if (done.indexOf(val) == -1) {
                        done.push(val);
                        this.drawImage(col, row, attrImages[attrValues.indexOf(val)]);
                    }
                });
            }
        }

        private projectAttrs(rid: number, whendo: number, begin: number, end: number): number[] {
            let attrCnt = (a: AttrType) => {
                let cnt = 0;
                for (let i = begin; i <= end; i++) {
                    if (getAttr(rid, whendo, i) == a) cnt++;
                }
                return cnt;
            }
            let res: number[] = [];
            let excludeCnt = attrCnt(AttrType.Exclude);
            let okCnt = attrCnt(AttrType.OK);
            let cnt = end - begin + 1;
            if (okCnt == this.manager.all().length || excludeCnt == cnt || (begin == 0 && okCnt == cnt))
                return res;
            let remove =
                (okCnt != 0 && excludeCnt != 0) ?
                    ((excludeCnt < okCnt) ? AttrType.OK : AttrType.Exclude) : -1;
            for (let i = begin; i <= end; i++) {
                if (getAttr(rid, whendo, i) != remove) res.push(i);
            }
            return res;
        }

        private attrMenu() {
            // which tile in the diamond are we attributing?
            let whenDo = this.getWhenDo(this.col(false), this.row(false));
            // for all user-defined sprites
            attrsCentered.forEach((img, i) => {
                this.drawImage(i, 5, img);
            });
            this.manager.all().forEach((image, i ) => {
                let a = getAttr(this.rule, whenDo, i);
                this.drawImage(i, 6, image);
                this.drawImage(i, 6, attrImages[attrValues.indexOf(a)]);
                this.dirMap.setPixel(i,6,a);
            });
            if (this.attrSelected == -1)
                this.selectAttr(0);
            this.drawImage(this.attrSelected, 5, cursorOut);
        }

        private selectAttr(a: number) {
            this.attrSelected = a;
        }

        private attrUpdate() {
            let a = this.row() == 5 ? this.col() : -1
            if (a != -1 && a < attrValues.length) { 
                this.selectAttr(a); return true; 
            }
            let m = this.row() == 6 ? this.col() : -1; 
            if (m != -1 && m < this.manager.all().length) { 
                let val = attrValues[this.attrSelected];
                if (val == AttrType.Include) { 
                    if (m < this.manager.fixed().length) {
                        this.setFixedOther(m, -1, AttrType.Exclude);
                        this.setMovableOther(m, -1, AttrType.Exclude);
                    } else {
                        this.setMovableOther(m, -1, AttrType.Exclude);
                        this.setFixedOther(m, -1, AttrType.OK);
                    }
                } else if (val == AttrType.OneOf) {
                    this.setFixedOther(m, AttrType.Include, AttrType.OneOf);
                    this.setMovableOther(m, AttrType.Include, AttrType.OneOf);
                } else if (m < this.manager.fixed().length) {
                    // not allowed to set all to exclude
                    let cnt = 0;
                    let i = 0;
                    for(;i<this.manager.fixed().length;i++) {
                        if (this.dirMap.getPixel(6,i) == AttrType.Exclude) {
                            cnt++; if (cnt == 2) break;
                        }
                    }
                    if (cnt == 2) {
                        let whenDo = this.getWhenDo(this.col(false), this.row(false));
                        this.setAttr(i, getAttr(this.rule, whenDo, m));
                    }
                }
                this.setAttr(m, val);
                return true;
            }
            return false;
        }

        private getWhenDo(col: number, row: number) {
            let whendo = getWhenDo(this.rule, col, row);
            if (whendo == -1) {
                whendo = makeWhenDo(this.rule, col, row);
                // default mapping::everything is possible
                this.manager.all().forEach((img,i) => { 
                    setAttr(this.rule, whendo, i, AttrType.OK);
                });
            }
            return whendo;
        }
        
        private setFixedOther(m: number, src: number, val: number) {
            let whenDo = this.getWhenDo(this.col(false), this.row(false));
            for(let o =0; o<this.manager.fixed().length; o++) {
                if (o != m) {
                    if (src == -1 || getAttr(this.rule, whenDo, o) == src)
                        this.setAttr(o, val);
                }
            }
        }
        private setMovableOther(m: number, src: number, val: number) {
            let whenDo = this.getWhenDo(this.col(false), this.row(false));
            for (let o = this.manager.fixed().length; o< this.manager.all().length; o++) {
                if (o != m) {
                    if (src == -1 || getAttr(this.rule, whenDo, o) == src)
                        this.setAttr(o, val);
                }
            }
        }

        private setAttr(m: number, val: AttrType) {
            let whenDo = this.getWhenDo(this.col(false), this.row(false));
            setAttr(this.rule, whenDo, m, val)
        }
    } 
}

